import SwiftUI
@main
struct AuthBandApp: App {
    @StateObject private var model=AppModel()
    @Environment(\.scenePhase) private var phase
    var body:some Scene {
        WindowGroup {
            RootView().environmentObject(model).preferredColorScheme(.dark).tint(.mint)
                .onChange(of:phase){_,value in model.scene(value)}
        }
    }
}
