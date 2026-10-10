import XCTest
import Crypto
@testable import AuthBandCore
@MainActor final class SyncCoordinatorTests:XCTestCase {
    let options=ChannelOptions(key:Data(repeating:7,count:16),pairID:UUID(uuidString:"00000000-0000-4000-8000-000000000001")!,epoch:1,salt:Data(repeating:9,count:32))
    func testOnlyProtectedDurableReceiptCanConfirmSnapshot() async throws {
        let link=try FakeLink(options:options),coordinator=SyncCoordinator(link:link,options:options)
        let snapshot=try BandSnapshot.make(from:Vault()),receipt=try await coordinator.synchronize(snapshot)
        XCTAssertEqual(receipt.vaultID,snapshot.vault.vaultID);XCTAssertEqual(receipt.revision,"0")
        XCTAssertEqual(link.commitCount,1);XCTAssertTrue(link.maximumSize<=512)
        coordinator.close();do{_ = try await coordinator.synchronize(snapshot);XCTFail("closed coordinator") }catch{}
    }
    func testWrongDigestAndUnauthenticatedAcknowledgementNeverConfirm() async throws {
        for mode in [1,2] {
            let link=try FakeLink(options:options);link.mode=mode
            let coordinator=SyncCoordinator(link:link,options:options)
            do{_ = try await coordinator.synchronize(BandSnapshot.make(from:Vault()));XCTFail("must reject") }catch{}
        }
    }
    func testLostCommitResponseRetriesExactFrameWithoutSecondCommit() async throws {
        let link=try FakeLink(options:options);link.mode=3
        let coordinator=SyncCoordinator(link:link,options:options)
        _ = try await coordinator.synchronize(BandSnapshot.make(from:Vault()))
        XCTAssertEqual(link.commitCount,1);XCTAssertEqual(link.duplicates,1)
    }
    func testCloseDuringExchangeRejectsLateResponse() async throws {
        let link=try FakeLink(options:options),coordinator=SyncCoordinator(link:link,options:options)
        link.beforeReply={coordinator.close()}
        do{_ = try await coordinator.synchronize(BandSnapshot.make(from:Vault()));XCTFail("late response after close")}catch{}
        XCTAssertEqual(link.commitCount,0)
    }
}
@MainActor private final class FakeLink:ApplicationLink {
    let band:ProtectedChannel
    var mode=0,commitCount=0,maximumSize=0
    var manifest:[String:Any]=[:]
    var bytes=Data()
    var last:LinkMessage?,lastRequest:Data?,duplicates=0
    var beforeReply:(()->Void)?
    init(options:ChannelOptions) throws {band=try ProtectedChannel(options:options,direction:.band)}
    func exchange(topic:String,body:Data) async throws -> LinkMessage {
        maximumSize=max(maximumSize,body.count+100)
        if mode==2{return LinkMessage(topic:"ack",body:Data("{}".utf8))}
        if topic=="auth.hello" {let response=try reply("session.ready",[:]);beforeReply?();return response}
        let message=try band.open(JSONDecoder().decode(ProtectedFrame.self,from:body))
        if message.duplicate {XCTAssertEqual(body,lastRequest);duplicates+=1;return last!}
        let request=try JSONSerialization.jsonObject(with:message.payload) as! [String:Any]
        var result:[String:Any]=["request":request["request"]!],resultTopic=message.topic+".ok"
        switch message.topic {
        case "vault.status":result["empty"]=true
        case "vault.begin":manifest=request
        case "vault.chunk":bytes.append(Data(base64Encoded:request["data"] as! String)!);result["offset"]=bytes.count
        case "vault.commit":
            commitCount+=1;resultTopic="vault.committed";result["vaultID"]=manifest["vaultID"];result["revision"]=manifest["revision"];result["digest"]=mode==1 ? "bad":manifest["digest"]
            XCTAssertEqual(Data(SHA256.hash(data:bytes)).map{String(format:"%02x",$0)}.joined(),manifest["digest"] as? String)
        case "time.probe":result["wallMs"]=Date().timeIntervalSince1970*1000
        case "time.sample":break
        default:throw SyncError.invalidReply
        }
        let response=try reply(resultTopic,result);last=response;lastRequest=body
        if mode==3 && message.topic=="vault.commit" {mode=0;throw SyncError.timeout}
        return response
    }
    func reply(_ topic:String,_ body:[String:Any]) throws -> LinkMessage {LinkMessage(topic:"auth.frame",body:try JSONEncoder().encode(band.seal(topic:topic,payload:JSONSerialization.data(withJSONObject:body,options:.sortedKeys))))}
    func close(){band.close()}
}
