import Foundation
import AuthBandCore
import BlueBandCore

protocol InterconnectLinkSession:Sendable {
    func interconnectEvents() async -> AsyncStream<InterconnectEvent>
    func send(topic:String,body:[String:JSONValue]) async throws -> String
    func disconnect() async
}
extension BandSession:InterconnectLinkSession {}

@MainActor final class BlueBandApplicationLink:ApplicationLink {
    private let session:any InterconnectLinkSession
    private var eventsTask:Task<Void,Never>?
    private var timer:Task<Void,Never>?
    private var readyTimer:Task<Void,Never>?
    private var waiter:CheckedContinuation<LinkMessage,Error>?
    private var readyWaiter:CheckedContinuation<Void,Error>?
    private var ready=false
    private var closed=false
    private var sending=false
    private var replyTopic="auth.frame"
    private var token=UUID()
    init(session:any InterconnectLinkSession){self.session=session}
    func start() async {
        let stream=await session.interconnectEvents()
        eventsTask=Task { [weak self] in
            for await event in stream {guard let self,!Task.isCancelled else{return};self.receive(event)}
            self?.fail(SyncError.disconnected)
        }
    }
    func waitUntilReady() async throws {
        guard !closed else{throw SyncError.disconnected};if ready{return}
        try await withCheckedThrowingContinuation {continuation in
            readyWaiter=continuation;readyTimer=Task { [weak self] in
                try? await Task.sleep(for:.seconds(15));guard !Task.isCancelled else{return};self?.fail(SyncError.timeout)
            }
        }
    }
    func exchange(topic:String,body:Data) async throws -> LinkMessage {
        guard !closed,ready,!sending,waiter==nil else{throw SyncError.disconnected}
        let object=try JSONDecoder().decode([String:JSONValue].self,from:body)
        let admission=try ApplicationEnvelope.message(id:String(repeating:"i",count:32),source:.ios,topic:topic,body:object).encoded()
        guard admission.count<=512 else{throw SyncError.invalidReply}
        replyTopic=topic=="auth.enroll" ? "auth.enrolled":"auth.frame"
        sending=true;defer{sending=false};let request=UUID();token=request
        return try await withCheckedThrowingContinuation {continuation in
            waiter=continuation
            timer=Task { [weak self] in
                try? await Task.sleep(for:.seconds(4));guard !Task.isCancelled,self?.token==request else{return};self?.finish(.failure(SyncError.timeout))
            }
            Task { [weak self] in
                do {_ = try await self?.session.send(topic:topic,body:object)}
                catch {if self?.token==request{self?.finish(.failure(error))}}
            }
        }
    }
    private func receive(_ event:InterconnectEvent) {
        guard !closed else{return}
        switch event {
        case .connected:ready=true;readyTimer?.cancel();readyTimer=nil;let old=readyWaiter;readyWaiter=nil;old?.resume()
        case .received(let envelope):
            guard envelope.type == .message,envelope.src == .band,envelope.topic==replyTopic,let body=envelope.body,let encoded=try? envelope.encoded(),encoded.count<=512,let payload=try? JSONEncoder().encode(body) else{return}
            finish(.success(LinkMessage(topic:replyTopic,body:payload)))
        case .disconnected,.trustRejected:fail(SyncError.disconnected)
        default:break // Delivery acknowledgements cannot complete a protected exchange.
        }
    }
    private func finish(_ result:Result<LinkMessage,Error>) {timer?.cancel();timer=nil;let old=waiter;waiter=nil;old?.resume(with:result)}
    private func fail(_ error:Error) {readyTimer?.cancel();readyTimer=nil;let old=readyWaiter;readyWaiter=nil;old?.resume(throwing:error);finish(.failure(error));ready=false}
    func close(){guard !closed else{return};closed=true;fail(SyncError.disconnected);eventsTask?.cancel();eventsTask=nil;Task {await session.disconnect()}}
}
