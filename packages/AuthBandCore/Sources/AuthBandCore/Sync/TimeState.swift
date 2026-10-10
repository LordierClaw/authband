import Foundation
public struct TimeReading:Equatable {public let trusted:Bool;public let unixSeconds:Int64}
public struct ClockCheckpoint:Codable,Equatable,Sendable {
    public let offset:Double
    public let wallMs:Double
    public let uncertainty:Double
    public init(offset:Double,wallMs:Double,uncertainty:Double){self.offset=offset;self.wallMs=wallMs;self.uncertainty=uncertainty}
}
public struct TimeState {
    public init(saved:ClockCheckpoint?=nil) {}
    public mutating func observe(wallMs:Double,monotonicMs:Double?=nil)->TimeReading {TimeReading(trusted:false,unixSeconds:0)}
    public mutating func applySample(phoneMs:Double,wallMs:Double,rttMs:Double) throws -> ClockCheckpoint {throw ChannelError.invalid}
}
