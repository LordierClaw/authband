import Foundation
public enum Base32 {
    public static func decode(_ text: String) throws -> SecretBytes { throw OTPError.invalidSecret }
}
