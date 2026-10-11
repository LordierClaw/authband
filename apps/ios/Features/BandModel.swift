import SwiftUI
import Security
import AuthBandCore
import BlueBandCore
import BlueBandProtocol
import BlueBandCryptoCommonCrypto

struct PairedBand:Codable {
    let id:UUID
    let name:String
    let authKey:Data
    let pairID:UUID
    let pairingKey:Data
    var epoch:UInt64
    var confirmed:CommittedState?
}

@MainActor final class BandModel:ObservableObject {
    @Published var candidates:[BandCandidate]=[]
    @Published var scanning=false
    @Published var working=false
    @Published var connected=false
    @Published var status="Chưa kết nối"
    @Published var device:PairedBand?
    @Published var error:String?
    private var central:BandCentral?
    private var session:BandSession?
    private var link:BlueBandApplicationLink?
    private var coordinator:SyncCoordinator?
    private var scanTask:Task<Void,Never>?
    private var scanTimer:Task<Void,Never>?
    private var generation=UUID()
    private var store:EncryptedVaultStore?
    private var corrupt=false
    var canForget:Bool {store != nil && (device != nil || corrupt)}
    func load(_ store:EncryptedVaultStore?) {
        self.store=store
        do{device=try store?.loadPrivateState(PairedBand.self);corrupt=false}
        catch{corrupt=true;self.error="Không đọc được cấu hình band. Không tạo khóa mới thay thế."}
    }
    private func getCentral()->BandCentral {if let central{return central};let next=BandCentral();central=next;return next}
    func scan(){
        guard !working,!scanning else{return};let central=getCentral();scanning=true;candidates=[]
        scanTask=Task { [weak self] in
            do{for try await values in await central.scan(){guard let self,!Task.isCancelled else{return};self.candidates=values}}
            catch{self?.error="Không quét được Bluetooth. Kiểm tra quyền và Bluetooth."}
            self?.scanning=false
        }
        scanTimer=Task { [weak self] in try? await Task.sleep(for:.seconds(15));guard !Task.isCancelled else{return};self?.stopScan() }
    }
    func stopScan(){scanTimer?.cancel();scanTask?.cancel();scanTask=nil;scanning=false;let central=central;Task{await central?.stopScan()}}
    func configure(_ candidate:BandCandidate,authKey:String) throws {
        guard !corrupt,device==nil,let store else{throw VaultError.locked}
        let auth=try AuthKey(hex:authKey)
        let state=PairedBand(id:candidate.id,name:candidate.name,authKey:auth.bytes,pairID:UUID(),pairingKey:try random(16),epoch:0)
        try store.savePrivateState(state);device=state;stopScan()
    }
    func forget() {
        guard let store,!working else{return};disconnect();let token=generation;working=true
        Task {
            defer{if token==generation{working=false}}
            do {
                try await KeychainTrustedRPKStore(service:"dev.lordierclaw.authband.rpk-trust").resetTrustedRPKFingerprint()
                guard token==generation else{return}
                try store.forgetPrivateState();device=nil;corrupt=false;candidates=[];status="Đã bỏ ghép trên iPhone"
            } catch {if token==generation{self.error="Chưa bỏ ghép được. Mở khóa và thử lại; tài khoản trên iPhone không bị xóa."}}
        }
    }
    private func enrollCapability(_ device:PairedBand,over link:BlueBandApplicationLink) async throws {
        let enrollment=try JSONSerialization.data(withJSONObject:["key":device.pairingKey.base64EncodedString(),"pairID":device.pairID.uuidString])
        let reply=try await link.exchange(topic:"auth.enroll",body:enrollment)
        guard reply.topic=="auth.enrolled",let body=try JSONSerialization.jsonObject(with:reply.body) as? [String:String],body["pairID"]==device.pairID.uuidString else{throw SyncError.invalidReply}
    }
    func connect(){
        guard !working,!corrupt,!connected,let device else{return};stopScan();working=true;status="Đang kết nối"
        let token=generation,central=getCentral(),cipher=CommonCryptoAESBlockCipher()
        let session=BandSession(central:central,authenticator:BandAuthenticator(device:AuthDeviceDescriptor(apiLevel:27,phoneName:"AuthBand iPhone",region:"VN"),cipher:cipher),cipher:cipher,trustedRPKStore:KeychainTrustedRPKStore(service:"dev.lordierclaw.authband.rpk-trust"),expectedPackage:"dev.lordierclaw.authband.band")
        self.session=session
        Task {
            do {
                try await session.connect(candidate:BandCandidate(id:device.id,name:device.name,rssi:nil),authKey:AuthKey(bytes:device.authKey))
                guard token==generation else{await session.disconnect();return}
                _ = try await session.requestProofData()
                guard token==generation else{await session.disconnect();return}
                let link=BlueBandApplicationLink(session:session);self.link=link;await link.start();status="Mở AuthBand trên band"
                try await link.waitUntilReady();guard token==generation else{link.close();return}
                #if AUTHBAND_CAPABILITY
                // Bootstrap only after Xiaomi AuthKey authentication and RPK trust.
                // The current band profile still rejects all personal OTP secrets.
                try await enrollCapability(device,over:link)
                guard token==generation else{link.close();return}
                #endif
                working=false;connected=true;status="Đã kết nối"
            } catch {guard token==generation else{return};disconnect();self.error="Kết nối thất bại. Kiểm tra AuthKey, app trên band và Mi Fitness."}
        }
        Task { [weak self] in
            try? await Task.sleep(for:.seconds(30));guard let self,self.generation==token,self.working,!self.connected else{return}
            self.disconnect();self.error="Hết thời gian kết nối."
        }
    }
    func synchronize(_ snapshot:AuthBandCore.BandSnapshot){
        guard !working,connected,var device,let link,let store else{return}
        working=true;status="Đang đồng bộ";let token=generation
        Task {
            do {
                guard device.epoch<9_007_199_254_740_991 else{throw ChannelError.invalid};device.epoch+=1
                try store.savePrivateState(device);self.device=device
                let options=ChannelOptions(key:device.pairingKey,pairID:device.pairID,epoch:device.epoch,salt:try random(32))
                let coordinator=SyncCoordinator(link:link,options:options);self.coordinator=coordinator
                _ = try await coordinator.synchronize(snapshot)
                guard token==generation else{return}
                // This build can send public fixtures only, never confirm a personal vault.
                device.confirmed=nil;try store.savePrivateState(device);self.device=device
                disconnect();status="Đã xác nhận mẫu RFC và giờ band"
            } catch {guard token==generation else{return};disconnect();status="Chưa xác nhận đồng bộ";self.error="Đồng bộ chưa hoàn tất. Dữ liệu trên iPhone vẫn được giữ. Kết nối lại để kiểm tra trạng thái."}
        }
    }
    func disconnect(){generation=UUID();stopScan();coordinator?.close();coordinator=nil;link?.close();link=nil;let old=session;session=nil;Task{await old?.disconnect()};central?.cancelConnections();working=false;connected=false;status="Chưa kết nối"}
    func lock(){disconnect();device=nil;store=nil;candidates=[];error=nil}
    private func random(_ count:Int) throws -> Data {var data=Data(count:count);guard data.withUnsafeMutableBytes({SecRandomCopyBytes(kSecRandomDefault,count,$0.baseAddress!)})==errSecSuccess else{throw ChannelError.invalid};return data}
}
