import SwiftUI
import AuthBandCore
struct GroupsView:View {
    @EnvironmentObject private var model:AppModel
    @State private var name=""
    @State private var selected:AccountGroup?
    @State private var naming=false
    @State private var deleting:AccountGroup?
    private var groups:[AccountGroup] {(model.vault?.groups ?? []).sorted{$0.order<$1.order}}
    var body:some View {
        NavigationStack {
            List {
                ForEach(groups) {group in
                    Button {selected=group;name=group.name;naming=true} label:{
                        HStack {
                            VStack(alignment:.leading,spacing:4){Text(group.name).foregroundStyle(.primary);Text("\(model.vault?.accounts.filter{$0.groupID==group.id}.count ?? 0) tài khoản").font(.caption).foregroundStyle(.secondary)}
                            Spacer();if group.isDefault{Image(systemName:"house").foregroundStyle(.secondary)}
                        }.padding(.vertical,6)
                    }
                    .swipeActions {if !group.isDefault {Button("Xóa",role:.destructive){deleting=group}}}
                }
                .onMove {source,destination in var ids=groups.map(\.id);ids.move(fromOffsets:source,toOffset:destination);Task{await model.edit(.reorderGroups(ids))}}
            }.navigationTitle("Nhóm").navigationBarTitleDisplayMode(.inline)
                .toolbar {ToolbarItem(placement:.topBarLeading){EditButton()};ToolbarItem(placement:.topBarTrailing){Button("Thêm nhóm",systemImage:"plus"){selected=nil;name="";naming=true}.labelStyle(.iconOnly).disabled(groups.count>=8)}}
                .alert(selected==nil ? "Thêm nhóm":"Đổi tên nhóm",isPresented:$naming){TextField("Tên nhóm",text:$name);Button("Hủy",role:.cancel){};Button("Lưu"){let edit:VaultEdit=selected.map{.renameGroup($0.id,name)} ?? .addGroup(name);Task{await model.edit(edit)}}}
                .confirmationDialog("Xóa nhóm?",isPresented:Binding(get:{deleting != nil},set:{if !$0{deleting=nil}}),titleVisibility:.visible){Button("Xóa nhóm",role:.destructive){if let g=deleting{Task{await model.edit(.deleteGroup(g.id))}};deleting=nil}} message:{Text("Tài khoản được chuyển về nhóm mặc định.")}
        }
    }
}
