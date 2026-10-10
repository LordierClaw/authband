// Confined to the Bluetooth delegate queue, like the link it belongs to.
final class ConnectionCloseState {
    private(set) var closing=false
    private(set) var closed=false
    private var completion:(() -> Void)?
    func begin(_ completion:@escaping () -> Void) -> Bool {
        guard !closed else{completion();return false}
        closing=true;self.completion=completion;return true
    }
    func finish(){guard !closed else{return};closed=true;let old=completion;completion=nil;old?()}
}
