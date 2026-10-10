import Foundation
public struct TimeReading:Equatable {public let trusted:Bool;public let unixSeconds:Int64}
public struct ClockCheckpoint:Codable,Equatable,Sendable {
    public let offset:Double
    public let wallMs:Double
    public let uncertainty:Double
    public init(offset:Double,wallMs:Double,uncertainty:Double){self.offset=offset;self.wallMs=wallMs;self.uncertainty=uncertainty}
}
public struct TimeState {
    private var trusted=false
    private var offset:Double=0
    private var lastWall:Double?
    private var lastMono:Double?
    public init(saved:ClockCheckpoint?=nil) {
        if let saved,saved.offset.isFinite,saved.wallMs.isFinite,saved.wallMs>=0,saved.uncertainty.isFinite,(0...500).contains(saved.uncertainty){trusted=true;offset=saved.offset;lastWall=saved.wallMs}
    }
    public mutating func observe(wallMs:Double,monotonicMs:Double?=nil)->TimeReading {
        if !wallMs.isFinite || wallMs<0 {trusted=false}
        if let lastWall,wallMs<lastWall-1000{trusted=false}
        if let lastMono,let lastWall,let monotonicMs,abs((wallMs-lastWall)-(monotonicMs-lastMono))>2000{trusted=false}
        lastWall=wallMs;lastMono=monotonicMs
        let seconds=floor((wallMs+offset)/1000)
        guard seconds.isFinite,seconds>=0,seconds<Double(Int64.max) else{trusted=false;return TimeReading(trusted:false,unixSeconds:0)}
        return TimeReading(trusted:trusted,unixSeconds:Int64(seconds))
    }
    public mutating func applySample(phoneMs:Double,wallMs:Double,rttMs:Double) throws -> ClockCheckpoint {
        guard phoneMs.isFinite,wallMs.isFinite,rttMs.isFinite,phoneMs>=0,wallMs>=0,(0...1000).contains(rttMs) else{throw ChannelError.invalid}
        offset=phoneMs+rttMs/2-wallMs;trusted=offset.isFinite;lastWall=wallMs;lastMono=nil
        guard trusted else{throw ChannelError.invalid}
        return ClockCheckpoint(offset:offset,wallMs:wallMs,uncertainty:rttMs/2)
    }
}
