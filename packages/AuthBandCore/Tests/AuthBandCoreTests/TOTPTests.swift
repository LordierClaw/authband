import XCTest
@testable import AuthBandCore
final class TOTPTests: XCTestCase {
    func testRFC6238() throws {
        let times: [Int64] = [59,1111111109,1111111111,1234567890,2000000000,20000000000]
        let rows: [(OTPAlgorithm, Int, [String])] = [
            (.sha1,20,["94287082","07081804","14050471","89005924","69279037","65353130"]),
            (.sha256,32,["46119246","68084774","67062674","91819424","90698825","77737706"]),
            (.sha512,64,["90693936","25091201","99943326","93441116","38618901","47863826"])]
        for (algorithm, count, codes) in rows {
            let secret = try SecretBytes(Data(String(repeating:"1234567890",count:7).utf8.prefix(count)))
            for (time, code) in zip(times, codes) {
                XCTAssertEqual(try TOTP.generate(secret: secret, parameters: OTPParameters(algorithm:algorithm,digits:8), unixSeconds:time).value, code)
            }
        }
    }
    func testSixDigitsAndValidity() throws {
        let code = try TOTP.generate(secret: SecretBytes(Data("12345678901234567890".utf8)), parameters: OTPParameters(), unixSeconds:59)
        XCTAssertEqual(code.value,"287082"); XCTAssertEqual(code.validFrom,30); XCTAssertEqual(code.validUntil,60)
    }
    func testRejectsInvalidParametersAndTime() throws {
        XCTAssertThrowsError(try OTPParameters(period:14)); XCTAssertThrowsError(try OTPParameters(digits:7))
        XCTAssertThrowsError(try SecretBytes(Data()))
        let key = try SecretBytes(Data([1]))
        for time: Int64 in [-1, Int64.max] { XCTAssertThrowsError(try TOTP.generate(secret:key,parameters:OTPParameters(),unixSeconds:time)) }
    }
}
