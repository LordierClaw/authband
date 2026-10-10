import Foundation
import Crypto
public enum ChannelError: Error { case invalid, authentication, sequence, closed }
public struct ChannelOptions: Sendable {
    public let key: Data
    public let pairID: UUID
    public let epoch: UInt64
    public let salt: Data
    public init(key:Data,pairID:UUID,epoch:UInt64,salt:Data) {self.key=key;self.pairID=pairID;self.epoch=epoch;self.salt=salt}
}
public struct SessionHello: Codable, Equatable, Sendable { public let v:Int;public let p:String;public let e:String;public let n:String;public let m:String }
public struct ProtectedFrame: Codable, Equatable, Sendable {public let v:Int;public let e:String;public let s:String;public let t:String;public var c:String}
public struct ProtectedMessage: Sendable {public let topic:String;public let payload:Data;public let sequence:UInt64;public let duplicate:Bool}
public final class ProtectedChannel {
    public enum Direction:String {case phone,band}
    public init(options:ChannelOptions,direction:Direction = .phone) throws {}
    public static func hello(_ options:ChannelOptions) throws -> SessionHello {throw ChannelError.invalid}
    public func seal(topic:String,payload:Data) throws -> ProtectedFrame {throw ChannelError.invalid}
    public func open(_ frame:ProtectedFrame) throws -> ProtectedMessage {throw ChannelError.invalid}
    public func close() {}
}
