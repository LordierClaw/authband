import SwiftUI
import PhotosUI
import AuthBandCore

struct ImportView:View {
    @EnvironmentObject private var model:AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var manual=false
    @State private var camera=false
    @State private var photo:PhotosPickerItem?
    @State private var collector=MigrationBatchCollector()
    @State private var preview:ImportPreview?
    @State private var progress:BatchProgress?
    @State private var message:String?
    @State private var group:UUID?
    @State private var generation:UInt64=0
    @State private var alive=true
    @State private var photoBusy=false
    var body:some View {
        NavigationStack {
            List {
                Section {
                    Button("Quét mã QR",systemImage:"qrcode.viewfinder"){camera=true}
                    PhotosPicker(selection:$photo,matching:.images){Label("Chọn ảnh QR",systemImage:"photo")}.disabled(photoBusy)
                    Button("Nhập thủ công",systemImage:"keyboard"){manual=true}
                }
                if let progress {Section{Label("Đã quét \(progress.receivedPartCount)/\(progress.totalPartCount) QR Google",systemImage:progress.isComplete ? "checkmark.circle":"qrcode");Button("Bắt đầu lại",role:.destructive){collector.reset();self.progress=nil;preview=nil}}}
                if let message {Text(message).foregroundStyle(.orange)}
                if photoBusy {ProgressView()}
                if let preview {
                    Section("Sẵn sàng nhập: \(preview.candidates.count)") {
                        Picker("Nhóm",selection:$group){ForEach(model.vault?.groups ?? []){Text($0.name).tag(Optional($0.id))}}
                        ForEach(Array(preview.candidates.enumerated()),id:\.offset){_,item in VStack(alignment:.leading){Text(item.issuer.isEmpty ? item.label:item.issuer);Text(item.label).font(.caption).foregroundStyle(.secondary)}}
                    }
                    if !preview.duplicates.isEmpty {Text("Bỏ qua \(preview.duplicates.count) tài khoản trùng").foregroundStyle(.secondary)}
                    ForEach(Array(preview.issues.enumerated()),id:\.offset){_,issue in Text(issue.reason).foregroundStyle(.orange)}
                    Button("Nhập \(preview.candidates.count) tài khoản") {save(preview)}.disabled(preview.candidates.isEmpty || model.busy || (progress != nil && progress?.isComplete != true))
                }
            }.navigationTitle("Thêm tài khoản").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Đóng"){alive=false;dismiss()}}}
                .sheet(isPresented:$manual){ManualEntry{candidate in guard valid else{return};manual=false;preview=ImportPreview(candidates:[candidate],existing:model.vault?.accounts ?? []);progress=nil;collector.reset()}}
                .sheet(isPresented:$camera){CameraScanner{values in guard valid else{return};camera=false;receive(values)}}
                .onAppear{generation=model.generation;group=model.vault?.groups.first(where:\.isDefault)?.id}
                .onDisappear{alive=false;collector.reset();preview=nil}
                .onChange(of:photo){_,item in
                    guard let item else{return};let token=generation;photoBusy=true
                    Task {
                        defer{photo=nil;photoBusy=false}
                        do {guard let data=try await item.loadTransferable(type:Data.self),data.count<=30_000_000 else{throw ImportError.tooLarge};let values=try await PhotoQR.read(data);guard alive,model.accepts(token) else{return};receive(values)}
                        catch {if alive,model.accepts(token){message="Không đọc được QR từ ảnh."}}
                    }
                }
        }
    }
    private var valid:Bool {alive && model.accepts(generation)}
    private func receive(_ values:[String]) {
        guard valid else{return}
        if values.isEmpty {message="Không tìm thấy mã QR.";return}
        do {
            var candidates:[ImportCandidate]=[],issues:[ImportIssue]=[]
            for value in values {
                if value.hasPrefix("otpauth-migration:") {
                    guard candidates.isEmpty else{throw ImportError.conflictingBatch}
                    let part=try MigrationDecoder.decode(value);progress=try collector.accept(part)
                } else {
                    guard progress==nil else{throw ImportError.conflictingBatch}
                    candidates.append(try OTPAuthParser.parse(value))
                }
            }
            if let progress {
                guard progress.isComplete else{preview=nil;message=nil;return}
                (candidates,issues)=try collector.result()
            }
            preview=ImportPreview(candidates:candidates,existing:model.vault?.accounts ?? [],issues:issues);message=nil
        } catch {message="QR không hợp lệ, không hỗ trợ hoặc không cùng đợt xuất Google."}
    }
    private func save(_ preview:ImportPreview) {
        guard valid,let group,let vault=model.vault else{return}
        let fresh=ImportPreview(candidates:preview.candidates,existing:vault.accounts)
        let start=(vault.accounts.map(\.order).max() ?? -1)+1
        let accounts=fresh.candidates.enumerated().map{offset,c in OTPAccount(issuer:c.issuer,label:c.label,secret:c.secret,parameters:c.parameters,groupID:group,order:start+offset)}
        Task {if await model.edit(.addAccounts(accounts),token:generation){alive=false;dismiss()}}
    }
}

private struct ManualEntry:View {
    @Environment(\.dismiss) private var dismiss
    @State private var issuer=""
    @State private var label=""
    @State private var secret=""
    @State private var algorithm=OTPAlgorithm.sha1
    @State private var digits=6
    @State private var period=30
    @State private var error:String?
    let submit:(ImportCandidate)->Void
    var body:some View {
        NavigationStack {
            Form {
                Section {TextField("Dịch vụ",text:$issuer);TextField("Tên tài khoản",text:$label).textInputAutocapitalization(.never);SecureField("Khóa bí mật Base32",text:$secret).textInputAutocapitalization(.characters).autocorrectionDisabled()}
                Section("Nâng cao") {
                    Picker("Thuật toán",selection:$algorithm){Text("SHA-1").tag(OTPAlgorithm.sha1);Text("SHA-256").tag(OTPAlgorithm.sha256);Text("SHA-512").tag(OTPAlgorithm.sha512)}
                    Picker("Chữ số",selection:$digits){Text("6").tag(6);Text("8").tag(8)}.pickerStyle(.segmented)
                    Stepper("Chu kỳ: \(period) giây",value:$period,in:15...120)
                }
                if let error{Text(error).foregroundStyle(.orange)}
            }.navigationTitle("Nhập thủ công").navigationBarTitleDisplayMode(.inline)
                .toolbar{ToolbarItem(placement:.cancellationAction){Button("Hủy"){secret="";dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Tiếp tục"){
                    do {guard !label.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,label.utf8.count<=256,issuer.utf8.count<=256 else{throw ImportError.malformed};let item=try ImportCandidate(issuer:issuer,label:label,secret:Base32.decode(secret),parameters:OTPParameters(algorithm:algorithm,digits:digits,period:period));secret="";submit(item)}
                    catch {self.error="Kiểm tra tên và khóa Base32."}
                }}}
                .onDisappear{secret=""}
        }
    }
}
