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
    public func validate(bandOnly: Bool = false) throws {
        guard schema==1, revision<=9_007_199_254_740_991, (1...8).contains(groups.count), accounts.count<=(bandOnly ? 50:100), groups.filter(\.isDefault).count==1 else {throw VaultError.capacity}
        let groupIDs=Set(groups.map(\.id))
        guard groupIDs.count==groups.count,Set(accounts.map(\.id)).count==accounts.count else {throw VaultError.invalid}
        for group in groups {guard !group.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,group.name.utf8.count<=64,group.order>=0 else {throw VaultError.invalid}}
        var counts:[UUID:Int]=[:],total=0
        for account in accounts {
            guard groupIDs.contains(account.groupID),account.order>=0,account.issuer.utf8.count<=256,account.label.utf8.count<=256,!account.label.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,!bandOnly || account.onBand else {throw VaultError.invalid}
            if account.onBand {total+=1;counts[account.groupID,default:0]+=1}
        }
        guard total<=50,counts.values.allSatisfy({$0<=20}) else {throw VaultError.capacity}
    }
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
    public func applying(_ edit: VaultEdit) throws -> Vault {
        try validate();guard revision<9_007_199_254_740_991 else {throw VaultError.invalid}
        var next=self
        switch edit {
        case .addAccounts(let items): next.accounts.append(contentsOf:items)
        case .upsertAccount(let account):
            guard let index=next.accounts.firstIndex(where:{$0.id==account.id}) else {throw VaultError.invalid}
            var updated=account
            if next.accounts[index].groupID != updated.groupID {updated.order=(next.accounts.filter{$0.groupID==updated.groupID}.map(\.order).max() ?? -1)+1}
            next.accounts[index]=updated
        case .deleteAccount(let id):
            guard next.accounts.contains(where:{$0.id==id}) else {throw VaultError.invalid}
            next.accounts.removeAll{$0.id==id}
        case .addGroup(let name): next.groups.append(AccountGroup(name:name,order:(next.groups.map(\.order).max() ?? -1)+1))
        case .renameGroup(let id,let name):
            guard let i=next.groups.firstIndex(where:{$0.id==id}) else {throw VaultError.invalid};next.groups[i].name=name
        case .deleteGroup(let id):
            guard let g=next.groups.first(where:{$0.id==id}),let defaultID=next.groups.first(where:{$0.isDefault})?.id else {throw VaultError.invalid}
            guard !g.isDefault else {throw VaultError.defaultGroup}
            next.groups.removeAll{$0.id==id}
            let moved=next.accounts.filter{$0.groupID==id}.sorted{$0.order<$1.order}.map(\.id)
            var order=(next.accounts.filter{$0.groupID==defaultID}.map(\.order).max() ?? -1)+1
            for accountID in moved {if let i=next.accounts.firstIndex(where:{$0.id==accountID}){next.accounts[i].groupID=defaultID;next.accounts[i].order=order;order+=1}}
        case .reorderGroups(let ids):
            guard Set(ids)==Set(groups.map(\.id)),ids.count==groups.count else {throw VaultError.invalid}
            next.groups=ids.enumerated().map{index,id in var g=groups.first{$0.id==id}!;g.order=index;return g}
        case .reorderAccounts(let group,let ids):
            let old=accounts.filter{$0.groupID==group}
            guard Set(ids)==Set(old.map(\.id)),ids.count==old.count else {throw VaultError.invalid}
            for i in next.accounts.indices where next.accounts[i].groupID==group {next.accounts[i].order=ids.firstIndex(of:next.accounts[i].id)!}
        }
        next.revision+=1;try next.validate();return next
    }
}
public struct BandSnapshot: Sendable {
    public let vault: Vault
    public static func make(from vault: Vault) throws -> BandSnapshot {
        try vault.validate();var selected=vault;selected.accounts=vault.accounts.filter(\.onBand);try selected.validate(bandOnly:true);return BandSnapshot(vault:selected)
    }
}
public enum SnapshotCodec {
    public static func encode(_ snapshot: BandSnapshot) throws -> Data {
        try snapshot.vault.validate(bandOnly:true)
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys,.withoutEscapingSlashes]
        let bytes=try encoder.encode(snapshot.vault);guard bytes.count<=65536 else {throw VaultError.capacity};return bytes
    }
    public static func decode(_ data: Data) throws -> BandSnapshot {
        guard data.count<=65536 else {throw VaultError.capacity}
        let vault=try JSONDecoder().decode(Vault.self,from:data);try vault.validate(bandOnly:true);return BandSnapshot(vault:vault)
    }
}
