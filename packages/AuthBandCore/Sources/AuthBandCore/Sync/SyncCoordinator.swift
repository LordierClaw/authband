import Foundation
public struct LinkMessage:Sendable {
    public let topic:String
    public let body:Data
    public init(topic:String,body:Data){self.topic=topic;self.body=body}
}
@MainActor public protocol ApplicationLink:AnyObject {
    func exchange(topic:String,body:Data) async throws -> LinkMessage
    func close()
}
public struct CommittedState:Codable,Equatable,Sendable {
    public let vaultID:UUID
    public let revision:String
    public let digest:String
    public init(vaultID:UUID,revision:String,digest:String){self.vaultID=vaultID;self.revision=revision;self.digest=digest}
}
public enum SyncError:Error {case disconnected,invalidReply,timeout,notAccepted,hardwareAcceptanceRequired}
@MainActor public final class SyncCoordinator {
    public init(link:any ApplicationLink,options:ChannelOptions) {}
    public func synchronize(_ snapshot:BandSnapshot) async throws -> CommittedState {throw SyncError.disconnected}
    public func close() {}
}
