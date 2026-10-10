import XCTest
@testable import AuthBandCore
final class ProtectedChannelTests:XCTestCase {
    let options=ChannelOptions(key:Data(repeating:7,count:16),pairID:UUID(uuidString:"00000000-0000-4000-8000-000000000001")!,epoch:1,salt:Data(repeating:9,count:32))
    func testIndependentNodeVectorAndDuplicateHandling() throws {
        let phone=try ProtectedChannel(options:options),band=try ProtectedChannel(options:options,direction:.band)
        XCTAssertEqual(try ProtectedChannel.hello(options).m,"QRMpDHYCplQeLFVHQZppyjClkGiT7cu1KqTbt0keBO4=")
        let frame=try phone.seal(topic:"vault.status",payload:Data("{}".utf8))
        XCTAssertEqual(frame.c,"3mSoLUZtsA3REXSwnnRGFnjw")
        var bad=frame;bad.c="AAAAAAAAAAAAAAAAAAAAAAAA";XCTAssertThrowsError(try band.open(bad))
        XCTAssertEqual(try band.open(frame).payload,Data("{}".utf8))
        XCTAssertTrue(try band.open(frame).duplicate)
        phone.close();XCTAssertThrowsError(try phone.seal(topic:"vault.status",payload:Data()))
    }
}
