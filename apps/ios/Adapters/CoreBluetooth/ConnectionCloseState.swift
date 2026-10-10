// Confined to the Bluetooth delegate queue, like the link it belongs to.
final class ConnectionCloseState {
    private(set) var closing=false
    private(set) var closed=false
    private var completions:[() -> Void]=[]
    func begin(_ completion:@escaping () -> Void) -> Bool {
        guard !closed else{completion();return false}
        completions.append(completion)
        guard !closing else{return false}
        closing=true;return true
    }
    func finish(){guard !closed else{return};closed=true;let old=completions;completions=[];old.forEach{$0()}}
}
