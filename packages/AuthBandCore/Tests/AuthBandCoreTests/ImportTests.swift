import XCTest
@testable import AuthBandCore
final class ImportTests: XCTestCase {
    func testURIAndExplicitValues() throws {
        let item=try OTPAuthParser.parse("otpauth://totp/Example:a%2Bb?secret=MY======&issuer=Example&algorithm=SHA256&digits=8&period=60")
        XCTAssertEqual(item.label,"a+b");XCTAssertEqual(item.issuer,"Example");XCTAssertEqual(item.secret.data,Data("f".utf8));XCTAssertEqual(item.parameters.period,60)
        XCTAssertEqual(try OTPAuthParser.parse("otpauth://totp/demo?secret=MY").parameters,try OTPParameters())
        for uri in ["otpauth://hotp/demo?secret=MY", "otpauth://totp/demo?secret=MY&secret=ME", "otpauth://totp/demo?secret=MY&digits=7", "otpauth://totp/demo?secret=MY&period=", "otpauth://totp/Issuer:demo?secret=MY&issuer=Other"] {XCTAssertThrowsError(try OTPAuthParser.parse(uri))}
    }
    // Hand-encoded protobuf fields, independent of the production parser.
    func migration(index:Int = 0, size:Int = 1, algorithm:UInt8 = 1) -> String {
        let record: [UInt8] = [10,1,102,18,4,100,101,109,111,26,3,82,70,67,32,algorithm,40,1,48,2]
        var bytes: [UInt8] = [10,UInt8(record.count)]+record+[16,1,24,UInt8(size)]
        if index>0 {bytes += [32,UInt8(index)]};bytes += [40,7]
        var c=URLComponents();c.scheme="otpauth-migration";c.host="offline";c.queryItems=[URLQueryItem(name:"data",value:Data(bytes).base64EncodedString())]
        return c.string!
    }
    func testMigrationProtoDefaultsAndUnsupportedRecord() throws {
        let p=try MigrationDecoder.decode(migration());XCTAssertEqual(p.batchIndex,0);XCTAssertEqual(p.candidates.count,1);XCTAssertEqual(p.candidates[0].secret.data,Data([102]));XCTAssertEqual(p.candidates[0].parameters.period,30)
        let bad=try MigrationDecoder.decode(migration(algorithm:4));XCTAssertTrue(bad.candidates.isEmpty);XCTAssertEqual(bad.issues.count,1)
    }
    func testBatchRescanConflictAndCompletion() throws {
        var collector=MigrationBatchCollector();let first=try MigrationDecoder.decode(migration(size:2))
        XCTAssertFalse(try collector.accept(first).isComplete);XCTAssertEqual(try collector.accept(first).receivedPartCount,1)
        XCTAssertThrowsError(try collector.result())
        let conflict=try MigrationDecoder.decode(migration(size:2,algorithm:4));XCTAssertThrowsError(try collector.accept(conflict))
        XCTAssertTrue(try collector.accept(MigrationDecoder.decode(migration(index:1,size:2))).isComplete)
        XCTAssertEqual(try collector.result().0.count,2)
    }
    func testDuplicatePreviewDoesNotImportTwice() throws {
        let item=try OTPAuthParser.parse("otpauth://totp/demo?secret=MY")
        let preview=ImportPreview(candidates:[item,item],existing:[])
        XCTAssertEqual(preview.candidates.count,1);XCTAssertEqual(preview.duplicates.count,1)
    }
}
