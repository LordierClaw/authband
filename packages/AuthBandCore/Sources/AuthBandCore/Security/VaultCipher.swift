import Foundation
import Crypto
public enum VaultCipher {
    public static func encrypt(_ vault:Vault,key:Data) throws -> Data {throw VaultError.locked}
    public static func decrypt(_ data:Data,key:Data) throws -> Vault {throw VaultError.locked}
}
public struct UnlockGate {
    public private(set) var generation:UInt64=0
    public private(set) var isUnlocked=false
    public private(set) var covered=true
    public init() {}
    public mutating func begin() -> UInt64 {generation}
    public mutating func complete(_ token:UInt64) -> Bool {false}
    public mutating func inactive() {}
    public mutating func active() {}
    public mutating func lock() {}
}
