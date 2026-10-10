import XCTest
@testable import AuthBandCore
final class VaultTests: XCTestCase {
    func account(_ vault: Vault, band: Bool = false) throws -> OTPAccount {
        try OTPAccount(issuer:"RFC",label:"test",secret:SecretBytes(Data([1,2,3])),parameters:OTPParameters(),groupID:vault.groups[0].id,order:vault.accounts.count,onBand:band)
    }
    func testDefaultAndRevisionTransaction() throws {
        let vault=Vault();try vault.validate()
        let next=try vault.applying(.addAccounts([account(vault)]))
        XCTAssertEqual(next.revision,1);XCTAssertEqual(next.accounts.count,1);XCTAssertFalse(next.accounts[0].onBand)
        XCTAssertThrowsError(try next.applying(.deleteGroup(next.groups[0].id)))
    }
    func testLimitsOrphansDuplicatesAndUTF8() throws {
        var v=Vault();v.accounts=try (0..<20).map{_ in try account(v,band:true)};try v.validate()
        v.accounts.append(try account(v,band:true));XCTAssertThrowsError(try v.validate())
        v.accounts=[];v.groups[0].name=String(repeating:"ấ",count:22);XCTAssertThrowsError(try v.validate())
        v=Vault();var a=try account(v);a.groupID=UUID();v.accounts=[a];XCTAssertThrowsError(try v.validate())
    }
    func testSnapshotIncludesOnlyExplicitlySelectedAccounts() throws {
        var v=Vault();v.accounts=[try account(v),try account(v,band:true)]
        let bytes=try SnapshotCodec.encode(BandSnapshot.make(from:v))
        let restored=try SnapshotCodec.decode(bytes)
        XCTAssertEqual(restored.vault.accounts.count,1)
        XCTAssertEqual(restored.vault.accounts[0].id,v.accounts[1].id)
        XCTAssertTrue(String(decoding:bytes,as:UTF8.self).contains("\"revision\":\"0\""))
    }
    func testDeletingGroupMovesAccounts() throws {
        var v=try Vault().applying(.addGroup("Work"));var a=try account(v);a.groupID=v.groups[1].id;v.accounts=[a]
        let next=try v.applying(.deleteGroup(v.groups[1].id));XCTAssertEqual(next.accounts[0].groupID,v.groups[0].id)
    }
    func testMovingAndDeletingGroupsAppendAccountsWithoutOrderCollisions() throws {
        var v=try Vault().applying(.addGroup("Work"))
        let a=try account(v);var b=try account(v);b.groupID=v.groups[1].id;v.accounts=[a,b]
        let merged=try v.applying(.deleteGroup(v.groups[1].id))
        XCTAssertEqual(Set(merged.accounts.map(\.order)).count,2)
        b.groupID=v.groups[0].id
        let moved=try v.applying(.upsertAccount(b));XCTAssertNotEqual(moved.accounts[0].order,moved.accounts[1].order)
    }
}
