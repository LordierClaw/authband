import UIKit

@MainActor final class PrivacyShield {
    static let shared=PrivacyShield()
    private var window:UIWindow?
    func show() {
        guard window==nil,let scene=UIApplication.shared.connectedScenes.compactMap({$0 as? UIWindowScene}).first(where:{$0.activationState == .foregroundActive || $0.activationState == .foregroundInactive}) else{return}
        let controller=UIViewController();controller.view.backgroundColor = .black
        controller.view.accessibilityIdentifier="privacy-shield"
        let mark=UILabel();mark.text="AuthBand";mark.textColor = .white;mark.font = .preferredFont(forTextStyle:.title1);mark.translatesAutoresizingMaskIntoConstraints=false
        controller.view.addSubview(mark);NSLayoutConstraint.activate([mark.centerXAnchor.constraint(equalTo:controller.view.centerXAnchor),mark.centerYAnchor.constraint(equalTo:controller.view.centerYAnchor)])
        let window=UIWindow(windowScene:scene);window.windowLevel = .alert+1;window.rootViewController=controller
        // A separate opaque window also covers presented import/pairing sheets.
        self.window=window;window.isHidden=false
    }
    func hide(){window?.isHidden=true;window=nil}
}
