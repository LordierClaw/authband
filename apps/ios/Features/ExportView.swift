import SwiftUI
import LocalAuthentication
import CoreImage.CIFilterBuiltins
import AuthBandCore

struct ExportView:View {
    @EnvironmentObject private var model:AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var export:MigrationExport?
    @State private var page=0
    @State private var message:String?
    @State private var authorizing=false
    var body:some View {
        NavigationStack {
            List {
                if let export {
                    if export.urls.isEmpty {Text("Không có tài khoản chu kỳ 30 giây để xuất.").foregroundStyle(.secondary)}
                    else {
                        Section {
                            QRCodeImage(text:export.urls[page]).frame(maxWidth:.infinity).padding(.vertical,8).accessibilityLabel("Mã QR \(page+1) trên \(export.urls.count)")
                            HStack {
                                Button("Trước",systemImage:"chevron.left"){page-=1}.labelStyle(.iconOnly).disabled(page==0)
                                Spacer();Text("Mã \(page+1)/\(export.urls.count)").font(.headline.monospacedDigit());Spacer()
                                Button("Tiếp",systemImage:"chevron.right"){page+=1}.labelStyle(.iconOnly).disabled(page>=export.urls.count-1)
                            }.buttonStyle(.borderless)
                        } footer:{Text("Mở Google Authenticator (hoặc app hỗ trợ “Nhập tài khoản”), chọn quét mã QR và quét lần lượt từng mã.")}
                    }
                    if !export.skipped.isEmpty {
                        Section("Không xuất được (chu kỳ khác 30 giây)") {ForEach(export.skipped){Text($0.issuer.isEmpty ? $0.label:"\($0.issuer) · \($0.label)")}}
                    }
                    Label("Ai chụp hoặc quét được các mã này sẽ có toàn bộ khóa bí mật. Chỉ hiện ở nơi riêng tư.",systemImage:"exclamationmark.shield").font(.footnote).foregroundStyle(.orange)
                } else if authorizing {ProgressView().frame(maxWidth:.infinity)}
                else {
                    if let message {Text(message).foregroundStyle(.orange)}
                    Button("Xác nhận và hiện mã",systemImage:"faceid"){authorize()}
                }
            }.navigationTitle("Xuất tài khoản").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Đóng"){export=nil;dismiss()}}}
                .onAppear{authorize()}
                .onDisappear{export=nil}
        }
    }
    private func authorize() {
        guard !authorizing,export==nil else{return}
        let token=model.generation,context=LAContext();authorizing=true;message=nil
        Task {
            defer{authorizing=false}
            do {
                guard try await context.evaluatePolicy(.deviceOwnerAuthentication,localizedReason:"Xác nhận để hiện mã QR chứa khóa bí mật") else{throw SecureStoreError.authentication}
                // The Face ID sheet briefly covers the app, so check the lock generation rather than accepts().
                guard token==model.generation,let vault=model.vault else{return}
                let order=Dictionary(uniqueKeysWithValues:vault.groups.map{($0.id,$0.order)})
                let accounts=vault.accounts.sorted{(order[$0.groupID] ?? 0,$0.order)<(order[$1.groupID] ?? 0,$1.order)}
                export=try MigrationEncoder.encode(accounts);page=0
            } catch {message="Chưa xác nhận được. Thử lại."}
        }
    }
}

private struct QRCodeImage:View {
    let text:String
    var body:some View {
        if let image=Self.render(text) {Image(decorative:image,scale:1).interpolation(.none).resizable().scaledToFit().frame(maxWidth:320).padding(12).background(.white)}
        else {Text("Không tạo được mã QR.").foregroundStyle(.orange)}
    }
    private static func render(_ text:String) -> CGImage? {
        let filter=CIFilter.qrCodeGenerator();filter.message=Data(text.utf8);filter.correctionLevel="M"
        guard let output=filter.outputImage?.transformed(by:CGAffineTransform(scaleX:10,y:10)) else{return nil}
        return CIContext().createCGImage(output,from:output.extent)
    }
}
