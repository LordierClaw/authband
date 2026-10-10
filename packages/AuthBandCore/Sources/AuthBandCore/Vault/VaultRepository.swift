import Foundation
public protocol VaultStore: Sendable {
    func load() async throws -> Vault?
    func save(_ vault:Vault) async throws
    func lock() async
}
public actor VaultRepository {
    public init(store:any VaultStore) {}
    public func apply(_ edit:VaultEdit) async throws -> Vault {throw VaultError.locked}
    public func load() async throws -> Vault {throw VaultError.locked}
    public func lock() async {}
}
