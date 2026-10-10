import SwiftUI
import AuthBandCore
import BlueBandCore
struct BandView:View {
    @EnvironmentObject private var model:AppModel
    @StateObject private var band=BandModel()
    @State private var chosen:BandCandidate?
    @State private var authKey=""
    @State private var keyVisible=false
    @State private var setup=false
    var body:some View {
        NavigationStack {
            List {
                Section {
                    Label(band.device?.name ?? "Mi Band 10",systemImage:"applewatch")
                    LabeledContent("Trạng thái",value:band.status)
                    LabeledContent("Đã chọn",value:"\(model.vault?.accounts.filter(\.onBand).count ?? 0) / 50")
                    if let confirmed=band.device?.confirmed {LabeledContent("Band đã xác nhận",value:confirmed.revision)}
                    if band.device?.confirmed?.revision != model.vault.map({String($0.revision)}) {Label("Có thay đổi chưa đồng bộ",systemImage:"arrow.triangle.2.circlepath").foregroundStyle(.orange)}
                }
                if band.device==nil {
                    Section {
                        Button(band.scanning ? "Dừng tìm":"Tìm band",systemImage:band.scanning ? "stop.circle":"antenna.radiowaves.left.and.right"){if band.scanning{band.stopScan()}else{band.scan()}}
                        ForEach(band.candidates){candidate in Button{chosen=candidate;authKey="";setup=true} label:{HStack{Text(candidate.name);Spacer();if let rssi=candidate.rssi{Text("\(rssi) dBm").foregroundStyle(.secondary)}}}}
                    }
                } else {
                    Section {
                        Button(band.connected || band.working ? "Ngắt kết nối":"Kết nối",systemImage:band.connected || band.working ? "xmark.circle":"link"){if band.connected || band.working{band.disconnect()}else{band.connect()}}
                        if band.working {ProgressView()}
                        Button("Khóa ghép band",systemImage:"key"){keyVisible.toggle()}
                        if keyVisible {Text(band.pairingText).font(.system(.title3,design:.monospaced)).textSelection(.disabled).privacySensitive()}
                    }
                    Section {
                        Button("Đồng bộ tài khoản",systemImage:"arrow.triangle.2.circlepath"){}.disabled(true)
                        Label("Khóa thật: chờ kiểm chứng thiết bị",systemImage:"shield.lefthalf.filled").font(.caption).foregroundStyle(.orange)
                        #if AUTHBAND_CAPABILITY
                        Button("Đồng bộ mẫu RFC",systemImage:"checkmark.shield"){syntheticSync()}.disabled(!band.connected || band.working)
                        #endif
                    }
                }
            }.navigationTitle("Band").navigationBarTitleDisplayMode(.inline)
                .onAppear{band.load(model.store);model.onLock={band.lock()}}
                .onDisappear{keyVisible=false;authKey="";band.disconnect()}
                .alert("Thiết lập band",isPresented:$setup){SecureField("AuthKey Xiaomi (32 hex)",text:$authKey);Button("Hủy",role:.cancel){authKey=""};Button("Lưu"){defer{authKey=""};do{if let chosen{try band.configure(chosen,authKey:authKey);keyVisible=true}}catch{band.error="Không lưu được cấu hình. Kiểm tra AuthKey và trạng thái mở khóa."}}} message:{Text("Mã OTP sẽ được lưu trên band để sử dụng offline.")}
                .alert("Band",isPresented:Binding(get:{band.error != nil},set:{if !$0{band.error=nil}})){Button("Đóng",role:.cancel){band.error=nil}} message:{Text(band.error ?? "")}
        }
    }
    #if AUTHBAND_CAPABILITY
    private func syntheticSync() {
        guard let source=model.vault else{return}
        do {
            band.synchronize(try CapabilityFixtures.snapshot(source:source))
        } catch {band.error="Không tạo được dữ liệu kiểm chứng."}
    }
    #endif
}
