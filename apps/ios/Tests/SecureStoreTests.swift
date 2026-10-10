import XCTest
import AuthBandCore
@testable import AuthBand
@MainActor final class SecureStoreTests:XCTestCase {
    func testEncryptedRoundtripCorruptionAndLockNeverCreateEmptyVault() async throws {
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let store=EncryptedVaultStore(key:Data(repeating:3,count:32),directory:directory)
        var vault=Vault();vault.accounts=[try OTPAccount(issuer:"Public",label:"Fixture",secret:SecretBytes(Data("public-adapter-test-key".utf8)),parameters:OTPParameters(),groupID:vault.groups[0].id,order:0)]
        try await store.save(vault);let loaded=try await store.load();XCTAssertEqual(loaded,vault)
        let file=directory.appendingPathComponent("vault.abv"),bytes=try Data(contentsOf:file)
        XCTAssertNil(bytes.range(of:Data("public-adapter-test-key".utf8)))
        XCTAssertEqual(try file.resourceValues(forKeys:[.isExcludedFromBackupKey]).isExcludedFromBackup,true)
        try Data("corrupt".utf8).write(to:file)
        do{_ = try await store.load();XCTFail("corrupt vault must fail")}catch{}
        XCTAssertEqual(try Data(contentsOf:file),Data("corrupt".utf8))
        await store.lock();do{try await store.save(vault);XCTFail("locked store must fail")}catch{}
    }
    func testCompleteFileProtectionOnDevice() async throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("File protection metadata is not supplied by the simulator; run on a passcode-protected iPhone.")
        #else
        let directory=FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer{try? FileManager.default.removeItem(at:directory)}
        let store=EncryptedVaultStore(key:Data(repeating:3,count:32),directory:directory)
        try await store.save(Vault())
        let attrs=try FileManager.default.attributesOfItem(atPath:directory.appendingPathComponent("vault.abv").path)
        XCTAssertEqual(attrs[.protectionKey] as? FileProtectionType,.complete)
        #endif
    }
    func testApplicationPermissionsAndDeploymentContract() {
        let info=Bundle.main.infoDictionary ?? [:]
        XCTAssertEqual(info["MinimumOSVersion"] as? String,"27.0")
        for key in ["NSFaceIDUsageDescription","NSCameraUsageDescription","NSBluetoothAlwaysUsageDescription"]{XCTAssertNotNil(info[key])}
        XCTAssertNil(info["UIBackgroundModes"]);XCTAssertNil(info["NSLocationWhenInUseUsageDescription"])
    }
}
