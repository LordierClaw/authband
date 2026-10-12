import XCTest
@testable import AuthBandCore
final class Base32Tests: XCTestCase {
    func testDecodeStrictPaddingAndManualWhitespace() throws {
        XCTAssertEqual(try Base32.decode("m y======").data,Data("f".utf8))
        XCTAssertEqual(try Base32.decode("MZXW6YTBOI").data,Data("foobar".utf8))
        XCTAssertEqual(try Base32.decode("MZ").data,Data("f".utf8))
        for value in ["","M","MY=","MY======A","00",String(repeating:"A",count:208)] {XCTAssertThrowsError(try Base32.decode(value))}
    }
}
