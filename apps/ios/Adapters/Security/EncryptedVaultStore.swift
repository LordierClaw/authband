import Foundation
import LocalAuthentication
import Security
import AuthBandCore

enum SecureStoreError: Error { case keychain, missingKey, authentication, protectedFile }

@MainActor
final class EncryptedVaultStore: VaultStore {
    private var key:Data?
    private let directory:URL
    private var file:URL {directory.appendingPathComponent("vault.abv")}
    init(key:Data,directory:URL) {self.key=key;self.directory=directory}
    static var directory:URL {FileManager.default.urls(for:.applicationSupportDirectory,in:.userDomainMask)[0].appendingPathComponent("AuthBand",isDirectory:true)}
    func load() async throws -> Vault? {
        guard let key else {throw VaultError.locked}
        guard FileManager.default.fileExists(atPath:file.path) else {return nil}
        return try VaultCipher.decrypt(Data(contentsOf:file,options:.uncached),key:key)
    }
    func save(_ vault:Vault) async throws {
        guard let key else {throw VaultError.locked}
        try write(VaultCipher.encrypt(vault,key:key),to:file)
    }
    func loadPrivateState<T:Decodable>(_ type:T.Type) throws -> T? {
        guard let key else {throw VaultError.locked}
        let url=directory.appendingPathComponent("device.abv")
        guard FileManager.default.fileExists(atPath:url.path) else {return nil}
        return try JSONDecoder().decode(type,from:VaultCipher.open(Data(contentsOf:url,options:.uncached),key:key))
    }
    func savePrivateState<T:Encodable>(_ state:T) throws {
        guard let key else {throw VaultError.locked}
        try write(VaultCipher.seal(JSONEncoder().encode(state),key:key),to:directory.appendingPathComponent("device.abv"))
    }
    func forgetPrivateState() throws {
        guard key != nil else{throw VaultError.locked}
        let url=directory.appendingPathComponent("device.abv")
        if FileManager.default.fileExists(atPath:url.path){try FileManager.default.removeItem(at:url)}
        guard !FileManager.default.fileExists(atPath:url.path) else{throw SecureStoreError.protectedFile}
    }
    private func write(_ data:Data,to url:URL) throws {
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true,attributes:[.protectionKey:FileProtectionType.complete])
        var directory=directory,values=URLResourceValues();values.isExcludedFromBackup=true;try directory.setResourceValues(values)
        try data.write(to:url,options:[.atomic,.completeFileProtection])
        var file=url;try file.setResourceValues(values)
    }
    func lock() async {invalidate()}
    func invalidate() {if var old=key {key=nil;old.resetBytes(in:0..<old.count)}}
}

enum VaultKeychain {
    static func unlock(context:LAContext,existingVault:Bool) async throws -> Data {
        guard try await context.evaluatePolicy(.deviceOwnerAuthentication,localizedReason:"Mở khóa AuthBand") else {throw SecureStoreError.authentication}
        return try await withCheckedThrowingContinuation {continuation in
            DispatchQueue.global(qos:.userInitiated).async {
                do {continuation.resume(returning:try key(context:context,existingVault:existingVault))}
                catch {continuation.resume(throwing:error)}
            }
        }
    }
    private static func key(context:LAContext,existingVault:Bool) throws -> Data {
        let query:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"dev.lordierclaw.authband.vault",kSecAttrAccount as String:"encryption-key",kSecAttrSynchronizable as String:false]
        var read=query;read[kSecReturnData as String]=true;read[kSecUseAuthenticationContext as String]=context
        var result:CFTypeRef?;let status=SecItemCopyMatching(read as CFDictionary,&result)
        if status==errSecSuccess {guard let data=result as? Data,data.count==32 else {throw SecureStoreError.keychain};return data}
        guard status==errSecItemNotFound else {throw SecureStoreError.keychain}
        guard !existingVault else {throw SecureStoreError.missingKey}
        var error:Unmanaged<CFError>?
        guard let access=SecAccessControlCreateWithFlags(nil,kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,.userPresence,&error) else {throw SecureStoreError.keychain}
        var bytes=Data(count:32)
        let random=bytes.withUnsafeMutableBytes {SecRandomCopyBytes(kSecRandomDefault,32,$0.baseAddress!)}
        guard random==errSecSuccess else {throw SecureStoreError.keychain}
        var attributes=query;attributes[kSecAttrAccessControl as String]=access;attributes[kSecValueData as String]=bytes;attributes[kSecUseAuthenticationContext as String]=context
        guard SecItemAdd(attributes as CFDictionary,nil)==errSecSuccess else {throw SecureStoreError.keychain}
        return bytes
    }
}
