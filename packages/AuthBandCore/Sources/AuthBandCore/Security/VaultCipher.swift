import Foundation
import Crypto
public enum VaultCipher {
    private static let header=Data("AuthBand/vault/1\n".utf8)
    public static func encrypt(_ vault:Vault,key:Data) throws -> Data {
        try vault.validate()
        let encoder=JSONEncoder();encoder.outputFormatting=[.sortedKeys,.withoutEscapingSlashes]
        return try seal(encoder.encode(vault),key:key)
    }
    public static func decrypt(_ data:Data,key:Data) throws -> Vault {
        let vault=try JSONDecoder().decode(Vault.self,from:open(data,key:key))
        try vault.validate();return vault
    }
    public static func seal(_ data:Data,key:Data) throws -> Data {
        guard key.count==32,data.count<=262144 else {throw VaultError.invalid}
        let box=try AES.GCM.seal(data,using:SymmetricKey(data:key),authenticating:header)
        guard let combined=box.combined else {throw VaultError.invalid}
        return header+combined
    }
    public static func open(_ data:Data,key:Data) throws -> Data {
        guard key.count==32,data.count<=262144+header.count+28,data.starts(with:header) else {throw VaultError.invalid}
        return try AES.GCM.open(AES.GCM.SealedBox(combined:data.dropFirst(header.count)),using:SymmetricKey(data:key),authenticating:header)
    }
}
public struct UnlockGate {
    public private(set) var generation:UInt64=0
    public private(set) var isUnlocked=false
    public private(set) var covered=true
    public init() {}
    private var foreground=true
    private var unlocking=false
    public mutating func begin() -> UInt64 {generation &+= 1;unlocking=true;return generation}
    public mutating func complete(_ token:UInt64) -> Bool {
        guard token==generation,unlocking else {return false}
        unlocking=false;isUnlocked=true;covered = !foreground;return true
    }
    public mutating func inactive() {foreground=false;covered=true}
    public mutating func active() {foreground=true;covered = !isUnlocked}
    public mutating func lock() {generation &+= 1;unlocking=false;isUnlocked=false;covered=true}
}
