import SwiftUI
import LocalAuthentication
import AuthBandCore
import UIKit

@MainActor
final class AppModel:ObservableObject {
    @Published private(set) var vault:Vault?
    @Published private(set) var covered=true
    @Published private(set) var busy=false
    @Published var error:String?
    @Published var notice:String?
    @Published var importSession=UUID()
    private var gate=UnlockGate()
    private var context:LAContext?
    private var repository:VaultRepository?
    private(set) var store:EncryptedVaultStore?
    var generation:UInt64 {gate.generation}
    var unlocked:Bool {gate.isUnlocked && !covered}
    var onLock:(()->Void)?
    init() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--uitest-public-fixture") {
            let token=gate.begin();_ = gate.complete(token);gate.active();covered=false
            var v=Vault();v.accounts=[try! OTPAccount(issuer:"RFC 6238",label:"Public test vector",secret:SecretBytes(Data("12345678901234567890".utf8)),parameters:OTPParameters(),groupID:v.groups[0].id,order:0)]
            vault=v
        }
        #endif
    }
    func unlock() {
        guard !busy,vault==nil else {return};busy=true;error=nil
        let token=gate.begin(),context=LAContext();self.context=context
        Task {
            do {
                let directory=EncryptedVaultStore.directory
                let exists=FileManager.default.fileExists(atPath:directory.appendingPathComponent("vault.abv").path) || FileManager.default.fileExists(atPath:directory.appendingPathComponent("device.abv").path)
                var key=try await VaultKeychain.unlock(context:context,existingVault:exists)
                guard token==gate.generation else {key.resetBytes(in:0..<key.count);return}
                let store=EncryptedVaultStore(key:key,directory:directory);key.resetBytes(in:0..<key.count)
                self.store=store;let repo=VaultRepository(store:store);repository=repo
                let loaded=try await repo.load()
                guard gate.complete(token) else {store.invalidate();return}
                vault=loaded;covered=gate.covered;busy=false;self.context=nil
            } catch {
                guard token==gate.generation else {return}
                store?.invalidate();store=nil;repository=nil;busy=false;self.context=nil
                self.error="Không thể mở kho. Kiểm tra Face ID hoặc mật mã thiết bị; dữ liệu hiện có không bị thay thế."
            }
        }
    }
    func scene(_ phase:ScenePhase) {
        switch phase {
        case .active:gate.active();covered=gate.covered
        case .inactive:gate.inactive();covered=true
        case .background:lock()
        @unknown default:lock()
        }
    }
    func lock() {
        gate.lock();covered=true;vault=nil;busy=false;importSession=UUID();notice=nil;error=nil
        context?.invalidate();context=nil;store?.invalidate();store=nil;onLock?()
        let old=repository;repository=nil;Task {await old?.lock()}
    }
    func accepts(_ token:UInt64) -> Bool {token==gate.generation && unlocked}
    @discardableResult
    func edit(_ edit:VaultEdit,token:UInt64?=nil) async -> Bool {
        guard accepts(token ?? generation),!busy,let repository else {return false}
        let token=generation;busy=true;defer {if token==generation{busy=false}}
        do {let next=try await repository.apply(edit);guard accepts(token) else{return false};vault=next;notice="Đã lưu trên iPhone";return true}
        catch {if accepts(token){error="Không thể lưu. Kiểm tra tên, giới hạn tài khoản và dung lượng trống."};return false}
    }
    func copy(_ account:OTPAccount) {
        guard unlocked else{return}
        do {
            let now=Date(),code=try TOTP.generate(secret:account.secret,parameters:account.parameters,unixSeconds:Int64(now.timeIntervalSince1970))
            UIPasteboard.general.setItems([[UIPasteboard.typeAutomatic:code.value]],options:[.localOnly:true,.expirationDate:min(now.addingTimeInterval(30),Date(timeIntervalSince1970:Double(code.validUntil)))])
            notice="Đã sao chép";UIImpactFeedbackGenerator(style:.light).impactOccurred()
        } catch {error="Giờ hệ thống không hợp lệ."}
    }
}
