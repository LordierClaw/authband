@main struct ConnectionCloseStateRegression {
    static func main() {
        let state=ConnectionCloseState();var calls=0
        precondition(state.begin{calls+=1},"First close must start native cancellation")
        let secondStarts=state.begin{calls+=1}
        state.finish()
        precondition(calls==2,"Both concurrent close waiters must complete")
        precondition(!secondStarts,"Concurrent close must not repeat native cancellation")
        state.finish();precondition(calls==2,"Finish must be idempotent")
        precondition(!state.begin{calls+=1},"Closed link must not cancel again")
        precondition(calls==3,"Close after disconnect must complete immediately")
        print("ConnectionCloseState regression passed")
    }
}
