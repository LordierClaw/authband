import XCTest
@testable import AuthBandCore
actor MemoryVaultStore: VaultStore {
    var value:Vault?;var failSave=false
    func load() async throws -> Vault? {value}
    func save(_ vault:Vault) async throws {if failSave {throw VaultError.invalid};value=vault}
    func lock() async {}
    func fail() {failSave=true}
}
final class RepositoryTests:XCTestCase {
    func testFailedSaveDoesNotPublishNewRevision() async throws {
        let store=MemoryVaultStore(),repo=VaultRepository(store:store)
        let initial=try await repo.load();XCTAssertEqual(initial.revision,0)
        await store.fail()
        do {_ = try await repo.apply(.addGroup("Work"));XCTFail("Save should fail")}catch{}
        let after=try await repo.load();XCTAssertEqual(after.revision,0);XCTAssertEqual(after.groups.count,1)
        await repo.lock()
        do {_ = try await repo.apply(.addGroup("Work"));XCTFail("Locked edit should fail")}catch{}
    }
}
