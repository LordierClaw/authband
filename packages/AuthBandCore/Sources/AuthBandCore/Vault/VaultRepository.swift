import Foundation
public protocol VaultStore: Sendable {
    func load() async throws -> Vault?
    func save(_ vault:Vault) async throws
    func lock() async
}
public actor VaultRepository {
    private let store:any VaultStore
    private var cached:Vault?
    private var isLocked=false
    private var busy=false
    private var generation:UInt64=0
    public init(store:any VaultStore) {self.store=store}
    public func apply(_ edit:VaultEdit) async throws -> Vault {
        guard !isLocked,let cached else {throw VaultError.locked};guard !busy else {throw VaultError.busy}
        busy=true;defer{busy=false};let token=generation,next=try cached.applying(edit)
        try await store.save(next);guard token==generation,!isLocked else {throw VaultError.locked}
        self.cached=next;return next
    }
    public func load() async throws -> Vault {
        guard !isLocked else {throw VaultError.locked};if let cached{return cached};guard !busy else {throw VaultError.busy}
        busy=true;defer{busy=false};let token=generation
        let loaded=try await store.load(),vault=loaded ?? Vault();try vault.validate()
        guard token==generation,!isLocked else {throw VaultError.locked}
        if loaded==nil {try await store.save(vault)}
        guard token==generation,!isLocked else {throw VaultError.locked};cached=vault;return vault
    }
    public func lock() async {generation &+= 1;isLocked=true;cached=nil;await store.lock()}
}
