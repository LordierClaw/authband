#if AUTHBAND_CAPABILITY || DEBUG
import Foundation
import AuthBandCore
enum CapabilityFixtures {
    static func snapshot(source:Vault) throws -> AuthBandCore.BandSnapshot {
        let group=AccountGroup(id:UUID(uuidString:"00000000-0000-4000-8000-000000000002")!,name:"RFC TEST",order:0,isDefault:true)
        let secret=try SecretBytes(Data("12345678901234567890".utf8))
        let accounts=try [6,8].enumerated().map{index,digits in OTPAccount(issuer:"RFC 6238",label:"Public fixture \(digits)",secret:secret,parameters:try OTPParameters(digits:digits),groupID:group.id,order:index,onBand:true)}
        return try AuthBandCore.BandSnapshot.make(from:Vault(vaultID:source.vaultID,revision:source.revision,groups:[group],accounts:accounts))
    }
}
#endif
