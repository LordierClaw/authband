import SwiftUI
struct BandView:View {
    @EnvironmentObject private var model:AppModel
    var body:some View {
        NavigationStack {
            List {
                Section {Label("Mi Band 10",systemImage:"applewatch");LabeledContent("Kết nối",value:"Chưa kết nối");LabeledContent("Đã chọn",value:"\(model.vault?.accounts.filter(\.onBand).count ?? 0) / 50")}
                Section {Label("Chờ kiểm chứng trên thiết bị",systemImage:"shield.lefthalf.filled").foregroundStyle(.orange)}
            }.navigationTitle("Band").navigationBarTitleDisplayMode(.inline)
        }
    }
}
