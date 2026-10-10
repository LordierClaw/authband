import XCTest
import AuthBandCore
@testable import AuthBand
@MainActor final class BandRecoveryTests:XCTestCase {
    func testCapabilitySnapshotIsStableAndCannotConfirmPersonalVault() throws {
        let source=Vault()
        let a=try CapabilityFixtures.snapshot(source:source),b=try CapabilityFixtures.snapshot(source:source)
        XCTAssertEqual(try SnapshotCodec.encode(a),try SnapshotCodec.encode(b))
        XCTAssertNotEqual(a.vault.vaultID,source.vaultID)
    }
    func testForgettingDevicePreservesVaultAndRequiresUnlockedStore() async throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let store=EncryptedVaultStore(key:Data(repeating:8,count:32),directory:directory),vault=Vault()
        try await store.save(vault);try store.savePrivateState(["device":"test"])
        try store.forgetPrivateState()
        XCTAssertNil(try store.loadPrivateState([String:String].self))
        let loaded=try await store.load();XCTAssertEqual(loaded,vault)
        store.invalidate();XCTAssertThrowsError(try store.forgetPrivateState())
    }
}
