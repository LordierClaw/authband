import Foundation
import Crypto
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
    private let link:any ApplicationLink
    private var options:ChannelOptions?
    private var channel:ProtectedChannel?
    private var closed=false
    private var busy=false
    private var requestID:UInt64=0
    public init(link:any ApplicationLink,options:ChannelOptions) {self.link=link;self.options=options}
    public func synchronize(_ snapshot:BandSnapshot) async throws -> CommittedState {
        guard !closed,!busy,let options else{throw SyncError.disconnected}
        busy=true;defer{busy=false}
        do {
            let bytes=try SnapshotCodec.encode(snapshot),digest=Data(SHA256.hash(data:bytes)).map{String(format:"%02x",$0)}.joined()
            let expected=CommittedState(vaultID:snapshot.vault.vaultID,revision:String(snapshot.vault.revision),digest:digest)
            channel=try ProtectedChannel(options:options);self.options=nil
            let hello=try JSONEncoder().encode(ProtectedChannel.hello(options))
            let ready=try await exchange(topic:"auth.hello",body:hello)
            guard ready.topic=="session.ready" else{throw SyncError.invalidReply}
            let status=try await request("vault.status",[:])
            if try matches(status,expected) {try await syncTime();return expected}
            _ = try await request("vault.begin",["vaultID":expected.vaultID.uuidString,"revision":expected.revision,"digest":digest,"byteCount":bytes.count])
            for offset in stride(from:0,to:bytes.count,by:96) {
                let chunk=bytes.subdata(in:offset..<min(offset+96,bytes.count))
                let response=try await request("vault.chunk",["offset":offset,"data":chunk.base64EncodedString()])
                guard (response["offset"] as? NSNumber)?.intValue==offset+chunk.count else{throw SyncError.invalidReply}
            }
            let receipt=try await request("vault.commit",[:],expectedTopic:"vault.committed")
            guard try matches(receipt,expected) else{throw SyncError.invalidReply}
            try await syncTime();return expected
        } catch {close();throw error}
    }
    private func matches(_ body:[String:Any],_ expected:CommittedState) throws -> Bool {
        if body["empty"] as? Bool == true{return false}
        let data=try JSONSerialization.data(withJSONObject:body)
        let state=try JSONDecoder().decode(CommittedState.self,from:data)
        return state==expected
    }
    private func syncTime() async throws {
        let wall=Date().timeIntervalSince1970*1000,start=ProcessInfo.processInfo.systemUptime
        let sample=try await request("time.probe",[:])
        let rtt=(ProcessInfo.processInfo.systemUptime-start)*1000
        guard rtt<=1000,let band=(sample["wallMs"] as? NSNumber)?.doubleValue else{throw SyncError.invalidReply}
        _ = try await request("time.sample",["phoneMs":wall,"wallMs":band,"rttMs":rtt])
    }
    private func request(_ topic:String,_ body:[String:Any],expectedTopic:String?=nil) async throws -> [String:Any] {
        guard !closed,let channel else{throw SyncError.disconnected}
        requestID+=1;var body=body;let id=String(requestID);body["request"]=id
        let payload=try JSONSerialization.data(withJSONObject:body,options:[.sortedKeys,.withoutEscapingSlashes])
        let frame=try JSONEncoder().encode(channel.seal(topic:topic,payload:payload))
        let message=try await exchange(topic:"auth.frame",body:frame)
        guard message.topic==(expectedTopic ?? topic+".ok"),let result=try JSONSerialization.jsonObject(with:message.payload) as? [String:Any],result["request"] as? String==id else{throw SyncError.invalidReply}
        return result
    }
    private func exchange(topic:String,body:Data) async throws -> ProtectedMessage {
        // Retries reuse the same sealed bytes, never a new sequence or nonce.
        for attempt in 0..<3 {
            guard !closed,let channel else{throw SyncError.disconnected}
            do {
                let reply=try await link.exchange(topic:topic,body:body)
                guard !closed,reply.topic=="auth.frame" else{throw SyncError.invalidReply}
                return try channel.open(JSONDecoder().decode(ProtectedFrame.self,from:reply.body))
            } catch SyncError.timeout {if attempt==2{throw SyncError.timeout}}
        }
        throw SyncError.timeout
    }
    public func close() {closed=true;channel?.close();channel=nil;options=nil;link.close()}
}
