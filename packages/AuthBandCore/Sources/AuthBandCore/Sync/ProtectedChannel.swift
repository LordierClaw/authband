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
    private let pairID:UUID
    private let epoch:UInt64
    private let salt:Data
    private let direction:Direction
    private let other:Direction
    private var tx:SymmetricKey?
    private var rx:SymmetricKey?
    private var sent:UInt64=0
    private var received:UInt64=0
    private var last:(ProtectedFrame,ProtectedMessage)?
    public init(options:ChannelOptions,direction:Direction = .phone) throws {
        try Self.validate(options);pairID=options.pairID;epoch=options.epoch;salt=options.salt;self.direction=direction;other=direction == .phone ? .band:.phone
        func derive(_ d:Direction)->SymmetricKey {HKDF<SHA256>.deriveKey(inputKeyMaterial:SymmetricKey(data:options.key),salt:options.salt,info:Data("AuthBand/key/1\n\(options.pairID.uuidString)\n\(options.epoch)\n\(d.rawValue)".utf8),outputByteCount:32)}
        tx=derive(direction);rx=derive(other)
    }
    private static func validate(_ options:ChannelOptions) throws {
        guard options.key.count==16,options.salt.count==32,options.epoch>0,options.epoch<=9_007_199_254_740_991 else {throw ChannelError.invalid}
    }
    public static func hello(_ options:ChannelOptions) throws -> SessionHello {
        try validate(options);let salt=options.salt.base64EncodedString(),p=options.pairID.uuidString,e=String(options.epoch)
        let transcript=Data("AuthBand/hello/1\n\(p)\n\(e)\n\(salt)".utf8)
        let mac=Data(HMAC<SHA256>.authenticationCode(for:transcript,using:SymmetricKey(data:options.key)))
        return SessionHello(v:1,p:p,e:e,n:salt,m:mac.base64EncodedString())
    }
    private func nonce(_ direction:Direction,_ sequence:UInt64) throws -> AES.GCM.Nonce {
        var value=sequence.bigEndian;var bytes=Data([0,0,0,direction == .phone ? 1:2]);withUnsafeBytes(of:&value){bytes.append(contentsOf:$0)}
        return try AES.GCM.Nonce(data:bytes)
    }
    private func aad(_ direction:Direction,_ sequence:String,_ topic:String)->Data {Data("AuthBand/frame/1\n\(pairID.uuidString)\n\(epoch)\n\(salt.base64EncodedString())\n\(direction.rawValue)\n\(sequence)\n\(topic)".utf8)}
    private func validTopic(_ topic:String)->Bool {topic.range(of:"^[a-z][a-z0-9.]{0,31}$",options:.regularExpression) != nil}
    public func seal(topic:String,payload:Data) throws -> ProtectedFrame {
        guard let tx else {throw ChannelError.closed}
        guard validTopic(topic),payload.count<=256,sent<UInt32.max else {throw ChannelError.invalid}
        let sequence=sent+1,s=String(sequence),box=try AES.GCM.seal(payload,using:tx,nonce:nonce(direction,sequence),authenticating:aad(direction,s,topic))
        sent=sequence
        return ProtectedFrame(v:1,e:String(epoch),s:s,t:topic,c:(box.ciphertext+box.tag).base64EncodedString())
    }
    public func open(_ frame:ProtectedFrame) throws -> ProtectedMessage {
        guard let rx else {throw ChannelError.closed}
        guard frame.v==1,frame.e==String(epoch),validTopic(frame.t),frame.c.utf8.count<=364,let sequence=UInt64(frame.s),String(sequence)==frame.s else {throw ChannelError.invalid}
        if let last,sequence==received,frame==last.0 {return ProtectedMessage(topic:last.1.topic,payload:last.1.payload,sequence:sequence,duplicate:true)}
        guard sequence==received+1,sequence<=UInt32.max else {throw ChannelError.sequence}
        guard let bytes=Data(base64Encoded:frame.c),bytes.count>=16,bytes.base64EncodedString()==frame.c else {throw ChannelError.invalid}
        let box=try AES.GCM.SealedBox(nonce:nonce(other,sequence),ciphertext:bytes.dropLast(16),tag:bytes.suffix(16))
        let payload=try AES.GCM.open(box,using:rx,authenticating:aad(other,frame.s,frame.t))
        let message=ProtectedMessage(topic:frame.t,payload:payload,sequence:sequence,duplicate:false)
        received=sequence;last=(frame,message);return message
    }
    public func close() {tx=nil;rx=nil;last=nil}
}
