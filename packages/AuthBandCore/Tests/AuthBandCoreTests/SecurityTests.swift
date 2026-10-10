import XCTest
@testable import AuthBandCore
final class SecurityTests:XCTestCase {
    func testCipherRandomNonceAndAuthenticatedRoundtrip() throws {
        let vault=Vault(),key=Data(repeating:7,count:32)
        let a=try VaultCipher.encrypt(vault,key:key),b=try VaultCipher.encrypt(vault,key:key)
        XCTAssertNotEqual(a,b);XCTAssertEqual(try VaultCipher.decrypt(a,key:key),vault)
        var tampered=a;tampered[tampered.count-1] ^= 1;XCTAssertThrowsError(try VaultCipher.decrypt(tampered,key:key))
        XCTAssertThrowsError(try VaultCipher.decrypt(a,key:Data(repeating:8,count:32)))
        XCTAssertThrowsError(try VaultCipher.decrypt(Data(),key:key))
    }
    func testFaceIDInactiveTransitionDoesNotInvalidateInFlightUnlock() {
        var gate=UnlockGate();let token=gate.begin();gate.inactive();XCTAssertTrue(gate.covered)
        XCTAssertTrue(gate.complete(token));gate.active();XCTAssertTrue(gate.isUnlocked);XCTAssertFalse(gate.covered)
    }
    func testBackgroundInvalidatesLateUnlockAndImportTokens() {
        var gate=UnlockGate();let token=gate.begin();gate.lock()
        XCTAssertFalse(gate.complete(token));XCTAssertTrue(gate.covered);XCTAssertFalse(gate.isUnlocked)
        let second=gate.begin();XCTAssertNotEqual(second,token)
    }
}
