import XCTest
import AuthBandCore
import BlueBandCore
@testable import AuthBand

@MainActor final class ApplicationLinkTests:XCTestCase {
    func testEnrollmentWaitsForItsReplyInsteadOfAProtectedFrame() async throws {
        let session=SilentLinkSession(),link=BlueBandApplicationLink(session:session)
        await link.start();await session.emit(.connected);try await link.waitUntilReady()
        let sent=expectation(description:"enrollment sent");await session.onSend{sent.fulfill()}
        let request=Task{try await link.exchange(topic:"auth.enroll",body:Data("{}".utf8))}
        await fulfillment(of:[sent],timeout:2)
        await session.emit(.received(ApplicationEnvelope.message(id:"b-1",source:.band,topic:"auth.frame",body:[:])))
        await session.emit(.received(ApplicationEnvelope.message(id:"b-2",source:.band,topic:"auth.enrolled",body:["pairID":.string("test")])))
        let reply=try await request.value;XCTAssertEqual(reply.topic,"auth.enrolled");link.close()
    }
    func testRepeatedConnectedEventDoesNotCancelExchangeDeadline() async throws {
        let session=SilentLinkSession(),link=BlueBandApplicationLink(session:session)
        await link.start()
        await session.emit(.connected)
        try await link.waitUntilReady()
        let sent=expectation(description:"request sent"),finished=expectation(description:"bounded exchange timeout")
        await session.onSend {sent.fulfill()}
        let request=Task {
            do {_ = try await link.exchange(topic:"auth.frame",body:Data("{}".utf8));XCTFail("Expected timeout")}
            catch {XCTAssertEqual(error as? SyncError,.timeout)}
            finished.fulfill()
        }
        await fulfillment(of:[sent],timeout:2)
        await session.emit(.connected)
        await fulfillment(of:[finished],timeout:6)
        link.close()
        await request.value
    }
}

private actor SilentLinkSession:InterconnectLinkSession {
    private let stream:AsyncStream<InterconnectEvent>
    private let continuation:AsyncStream<InterconnectEvent>.Continuation
    private var sent:(@Sendable () -> Void)?
    init(){let pair=AsyncStream<InterconnectEvent>.makeStream();stream=pair.stream;continuation=pair.continuation}
    func interconnectEvents() -> AsyncStream<InterconnectEvent>{stream}
    func onSend(_ callback:@escaping @Sendable () -> Void){sent=callback}
    func emit(_ event:InterconnectEvent){continuation.yield(event)}
    func send(topic:String,body:[String:JSONValue]) async throws -> String {sent?();return "test-request"}
    func disconnect(){continuation.finish()}
}
