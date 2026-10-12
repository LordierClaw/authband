import SwiftUI
import AuthBandCore

struct RootView:View {
    @EnvironmentObject private var model:AppModel
    @State private var confirmReset=false
    var body:some View {
        ZStack {
            if model.vault != nil {
                TabView {
                    AccountsView().tabItem{Label("Mã",systemImage:"key.horizontal")}
                    GroupsView().tabItem{Label("Nhóm",systemImage:"rectangle.3.group")}
                    BandView().tabItem{Label("Band",systemImage:"applewatch")}
                }.id(model.importSession)
            }
            if model.covered {
                Color.black.ignoresSafeArea()
                VStack(spacing:24) {
                    Image(systemName:"lock.shield").font(.system(size:56)).foregroundStyle(.mint)
                    Text("AuthBand").font(.largeTitle.bold())
                    if model.busy {ProgressView()}
                    else {Button("Mở khóa",systemImage:"faceid"){model.unlock()}.buttonStyle(.borderedProminent)}
                    if let error=model.error {Text(error).font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)}
                    if model.keyLost && !model.busy {Button("Xóa kho và bắt đầu lại",systemImage:"trash",role:.destructive){confirmReset=true}}
                }.padding(32)
                .confirmationDialog("Xóa kho cũ?",isPresented:$confirmReset,titleVisibility:.visible) {
                    Button("Xóa và tạo kho mới",role:.destructive){model.resetUnreadableVault()}
                } message:{Text("Kho cũ không thể giải mã nữa. Thao tác này xóa tệp kho và cấu hình band trên iPhone rồi tạo kho trống. Không hoàn tác được. Muốn ghép lại band phải gỡ và cài lại AuthBand trên band.")}
            }
        }
        .alert("Không thể hoàn tất",isPresented:Binding(get:{model.error != nil && model.unlocked},set:{if !$0{model.error=nil}})) {Button("Đóng",role:.cancel){model.error=nil}} message:{Text(model.error ?? "")}
    }
}

struct AccountsView:View {
    @EnvironmentObject private var model:AppModel
    @State private var search=""
    @State private var group:UUID?
    @State private var adding=false
    @State private var exporting=false
    @State private var editing:OTPAccount?
    private var accounts:[OTPAccount] {(model.vault?.accounts ?? []).filter{(group==nil || $0.groupID==group) && (search.isEmpty || ($0.issuer+" "+$0.label).localizedCaseInsensitiveContains(search))}.sorted{$0.order<$1.order}}
    var body:some View {
        NavigationStack {
            List {
                if let notice=model.notice {Text(notice).font(.caption).foregroundStyle(.mint).listRowBackground(Color.clear).accessibilityAddTraits(.updatesFrequently)}
                if let vault=model.vault,!vault.accounts.isEmpty {
                    Picker("Nhóm",selection:$group) {Text("Tất cả").tag(UUID?.none);ForEach(vault.groups.sorted{$0.order<$1.order}){Text($0.name).tag(Optional($0.id))}}.pickerStyle(.menu)
                }
                ForEach(accounts) {account in
                    TimelineView(.periodic(from:.now,by:1)) {context in
                        AccountRow(account:account,date:context.date){model.copy(account)}
                    }
                    .contextMenu {
                        Button("Sao chép",systemImage:"doc.on.doc"){model.copy(account)}
                        Button("Chỉnh sửa",systemImage:"pencil"){editing=account}
                    }
                    .swipeActions {Button("Chỉnh sửa",systemImage:"pencil"){editing=account}.tint(.gray)}
                }
                .onMove {source,destination in
                    guard let group,search.isEmpty else{return}
                    var ids=accounts.map(\.id);ids.move(fromOffsets:source,toOffset:destination)
                    Task {await model.edit(.reorderAccounts(group,ids))}
                }
            }
            .listStyle(.plain).background(.black)
            .overlay {if accounts.isEmpty {ContentUnavailableView(search.isEmpty ? "Chưa có tài khoản":"Không tìm thấy",systemImage:search.isEmpty ? "key.horizontal":"magnifyingglass")}}
            .navigationTitle("AuthBand").navigationBarTitleDisplayMode(.inline)
            .searchable(text:$search,prompt:"Tìm tài khoản")
            .toolbar {
                ToolbarItemGroup(placement:.topBarLeading) {
                    Button("Khóa",systemImage:"lock"){model.lock()}.labelStyle(.iconOnly)
                    Button("Xuất tài khoản",systemImage:"square.and.arrow.up"){exporting=true}.labelStyle(.iconOnly).disabled(model.vault?.accounts.isEmpty ?? true)
                }
                ToolbarItemGroup(placement:.topBarTrailing) {
                    if group != nil && search.isEmpty {EditButton()}
                    Button("Thêm tài khoản",systemImage:"plus"){adding=true}.labelStyle(.iconOnly)
                }
            }
            .sheet(isPresented:$adding){ImportView()}
            .sheet(isPresented:$exporting){ExportView()}
            .sheet(item:$editing){AccountEditor(account:$0)}
        }
    }
}

private struct AccountRow:View {
    let account:OTPAccount
    let date:Date
    let copy:()->Void
    var body:some View {
        let seconds=Int64(date.timeIntervalSince1970)
        let code=try? TOTP.generate(secret:account.secret,parameters:account.parameters,unixSeconds:seconds)
        let remaining=max(0,(code?.validUntil ?? seconds)-seconds)
        let value=code?.value ?? String(repeating:"-",count:account.parameters.digits)
        let half=value.index(value.startIndex,offsetBy:value.count/2)
        Button(action:copy) {
            VStack(alignment:.leading,spacing:6) {
                HStack {
                    Text(account.issuer.isEmpty ? account.label:account.issuer).font(.headline).foregroundStyle(.white).lineLimit(1)
                    Spacer(minLength:8)
                    if account.onBand {Image(systemName:"applewatch").font(.caption).foregroundStyle(.mint).accessibilityLabel("Đã chọn cho band")}
                }
                if !account.issuer.isEmpty {Text(account.label).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)}
                HStack(alignment:.firstTextBaseline) {
                    Text(String(value[..<half])+" "+String(value[half...])).font(.system(size:32,weight:.semibold,design:.monospaced)).minimumScaleFactor(0.65).lineLimit(1).foregroundStyle(.white).contentTransition(.numericText())
                    Spacer(minLength:12)
                    Text("\(remaining)s").font(.caption.monospacedDigit()).foregroundStyle(remaining<=5 ? Color.orange:Color.mint).frame(minWidth:28,alignment:.trailing)
                }
                ProgressView(value:Double(remaining),total:Double(account.parameters.period)).tint(remaining<=5 ? .orange:.mint).accessibilityHidden(true)
            }.padding(.vertical,10)
        }.buttonStyle(.plain).accessibilityHint("Sao chép mã xác thực")
    }
}

struct AccountEditor:View {
    @EnvironmentObject private var model:AppModel
    @Environment(\.dismiss) private var dismiss
    @State var account:OTPAccount
    @State private var deleting=false
    var body:some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Dịch vụ",text:$account.issuer)
                    TextField("Tên tài khoản",text:$account.label).textInputAutocapitalization(.never)
                    Picker("Nhóm",selection:$account.groupID){ForEach(model.vault?.groups ?? []){Text($0.name).tag($0.id)}}
                    Toggle("Hiện trên band",isOn:$account.onBand)
                }
                Section {LabeledContent("Thuật toán",value:account.parameters.algorithm.rawValue.uppercased());LabeledContent("Số chữ số",value:String(account.parameters.digits));LabeledContent("Chu kỳ",value:"\(account.parameters.period)s")}
                Section {Button("Xóa tài khoản",role:.destructive){deleting=true}}
            }.navigationTitle("Tài khoản").navigationBarTitleDisplayMode(.inline)
                .toolbar {ToolbarItem(placement:.cancellationAction){Button("Hủy"){dismiss()}};ToolbarItem(placement:.confirmationAction){Button("Lưu"){Task{if await model.edit(.upsertAccount(account)){dismiss()}}}.disabled(model.busy)}}
                .confirmationDialog("Xóa tài khoản này?",isPresented:$deleting,titleVisibility:.visible){Button("Xóa",role:.destructive){Task{if await model.edit(.deleteAccount(account.id)){dismiss()}}}} message:{Text("Bản trên band chỉ được xóa sau lần đồng bộ thành công tiếp theo.")}
        }
    }
}
