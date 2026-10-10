import Foundation
public enum VaultError: Error { case invalid, capacity, defaultGroup, locked, busy, stale }
public typealias AccountID = UUID
public typealias GroupID = UUID
public struct AccountGroup: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public var name: String
    public var order: Int
    public let isDefault: Bool
    public init(id: UUID = UUID(), name: String, order: Int, isDefault: Bool = false) {
        self.id=id; self.name=name; self.order=order; self.isDefault=isDefault
    }
}
public struct OTPAccount: Codable, Equatable, Identifiable, Sendable {
    public let id: UUID
    public var issuer: String
    public var label: String
    public let secret: SecretBytes
    public var parameters: OTPParameters
    public var groupID: UUID
    public var order: Int
    public var onBand: Bool
    public init(id: UUID = UUID(), issuer: String, label: String, secret: SecretBytes, parameters: OTPParameters, groupID: UUID, order: Int, onBand: Bool = false) {
        self.id=id;self.issuer=issuer;self.label=label;self.secret=secret;self.parameters=parameters;self.groupID=groupID;self.order=order;self.onBand=onBand
    }
}
public struct Vault: Codable, Equatable, Sendable {
    public var schema: Int = 1
    public let vaultID: UUID
    public var revision: UInt64
    public var groups: [AccountGroup]
    public var accounts: [OTPAccount]
    public init(vaultID: UUID = UUID(), revision: UInt64 = 0, groups: [AccountGroup] = [AccountGroup(name:"Cá nhân",order:0,isDefault:true)], accounts: [OTPAccount] = []) {
        self.vaultID=vaultID;self.revision=revision;self.groups=groups;self.accounts=accounts
    }
    public func validate(bandOnly: Bool = false) throws { throw VaultError.invalid }
    private enum CodingKeys: String, CodingKey { case schema,vaultID,revision,groups,accounts }
    public init(from decoder: Decoder) throws {
        let c=try decoder.container(keyedBy:CodingKeys.self)
        schema=try c.decode(Int.self,forKey:.schema);vaultID=try c.decode(UUID.self,forKey:.vaultID)
        let raw=try c.decode(String.self,forKey:.revision)
        guard let value=UInt64(raw),String(value)==raw,value<=9_007_199_254_740_991 else {throw VaultError.invalid}
        revision=value;groups=try c.decode([AccountGroup].self,forKey:.groups);accounts=try c.decode([OTPAccount].self,forKey:.accounts)
        try validate()
    }
    public func encode(to encoder: Encoder) throws {
        var c=encoder.container(keyedBy:CodingKeys.self)
        try c.encode(schema,forKey:.schema);try c.encode(vaultID,forKey:.vaultID);try c.encode(String(revision),forKey:.revision)
        try c.encode(groups,forKey:.groups);try c.encode(accounts,forKey:.accounts)
    }
}
public enum VaultEdit: Sendable {
    case addAccounts([OTPAccount]), upsertAccount(OTPAccount), deleteAccount(UUID)
    case addGroup(String), renameGroup(UUID,String), deleteGroup(UUID), reorderGroups([UUID]), reorderAccounts(UUID,[UUID])
}
extension Vault {
    public func applying(_ edit: VaultEdit) throws -> Vault { throw VaultError.invalid }
}
public struct BandSnapshot: Sendable {
    public let vault: Vault
    public static func make(from vault: Vault) throws -> BandSnapshot { throw VaultError.invalid }
}
public enum SnapshotCodec {
    public static func encode(_ snapshot: BandSnapshot) throws -> Data { throw VaultError.invalid }
    public static func decode(_ data: Data) throws -> BandSnapshot { throw VaultError.invalid }
}
