import Foundation
import Crypto

public enum OTPError: Error { case invalidSecret, invalidParameters, invalidTime }
public enum OTPAlgorithm: String, Codable, CaseIterable, Sendable { case sha1, sha256, sha512 }
public struct SecretBytes: Codable, Equatable, Sendable, CustomStringConvertible, CustomDebugStringConvertible {
    public let data: Data
    public init(_ data: Data) throws {
        guard (1...128).contains(data.count) else { throw OTPError.invalidSecret }
        self.data = data
    }
    public var description: String { "<redacted>" }
    public var debugDescription: String { description }
    public init(from decoder: Decoder) throws { try self.init(decoder.singleValueContainer().decode(Data.self)) }
    public func encode(to encoder: Encoder) throws { var box = encoder.singleValueContainer(); try box.encode(data) }
}
public struct OTPParameters: Codable, Equatable, Sendable {
    public let algorithm: OTPAlgorithm
    public let digits: Int
    public let period: Int
    public init(algorithm: OTPAlgorithm = .sha1, digits: Int = 6, period: Int = 30) throws {
        guard [6,8].contains(digits), (15...120).contains(period) else { throw OTPError.invalidParameters }
        self.algorithm = algorithm; self.digits = digits; self.period = period
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(algorithm: c.decode(OTPAlgorithm.self, forKey: .algorithm), digits: c.decode(Int.self, forKey: .digits), period: c.decode(Int.self, forKey: .period))
    }
}
public struct TOTPCode: Equatable, Sendable {
    public let value: String
    public let validFrom: Int64
    public let validUntil: Int64
}
public enum TOTP {
    public static func generate(secret: SecretBytes, parameters: OTPParameters, unixSeconds: Int64) throws -> TOTPCode {
        let period = Int64(parameters.period)
        guard unixSeconds >= 0, unixSeconds <= 9_007_199_254_740_991 - period else { throw OTPError.invalidTime }
        let start = unixSeconds / period * period
        var counter = UInt64(unixSeconds / period).bigEndian
        let message = withUnsafeBytes(of:&counter) { Data($0) }
        let key = SymmetricKey(data:secret.data)
        let mac: [UInt8]
        switch parameters.algorithm {
        case .sha1: mac = Array(HMAC<Insecure.SHA1>.authenticationCode(for:message,using:key))
        case .sha256: mac = Array(HMAC<SHA256>.authenticationCode(for:message,using:key))
        case .sha512: mac = Array(HMAC<SHA512>.authenticationCode(for:message,using:key))
        }
        let offset = Int(mac.last! & 15)
        let binary = UInt32(mac[offset] & 127) << 24 | UInt32(mac[offset+1]) << 16 | UInt32(mac[offset+2]) << 8 | UInt32(mac[offset+3])
        let modulus: UInt32 = parameters.digits == 6 ? 1_000_000 : 100_000_000
        return TOTPCode(value:String(format:"%0*d",parameters.digits,binary % modulus),validFrom:start,validUntil:start+period)
    }
}
