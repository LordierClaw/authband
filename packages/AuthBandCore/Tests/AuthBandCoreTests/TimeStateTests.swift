import XCTest
@testable import AuthBandCore
final class TimeStateTests:XCTestCase {
    func testTrustedTimeAndDiscontinuities() throws {
        var time=TimeState();XCTAssertFalse(time.observe(wallMs:59000).trusted)
        let checkpoint=try time.applySample(phoneMs:59000,wallMs:58000,rttMs:100)
        XCTAssertEqual(checkpoint.offset,1050);XCTAssertEqual(checkpoint.uncertainty,50)
        XCTAssertEqual(time.observe(wallMs:58000,monotonicMs:0).unixSeconds,59)
        XCTAssertTrue(time.observe(wallMs:59000,monotonicMs:1000).trusted)
        XCTAssertFalse(time.observe(wallMs:90000,monotonicMs:2000).trusted)
        XCTAssertThrowsError(try time.applySample(phoneMs:0,wallMs:0,rttMs:1001))
        var corrupt=TimeState(saved:ClockCheckpoint(offset:.nan,wallMs:5000,uncertainty:0));XCTAssertFalse(corrupt.observe(wallMs:5000).trusted)
    }
}
