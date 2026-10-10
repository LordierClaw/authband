import Foundation
public enum Base32 {
    public static func decode(_ text: String) throws -> SecretBytes {
        guard text.utf8.count<=512 else {throw OTPError.invalidSecret}
        let input=text.filter{!" \t\r\n".contains($0)}.uppercased()
        let alphabet=Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8), bytes=Array(input.utf8)
        let raw=Array(bytes.prefix{ $0 != 61 }), padding=bytes.count-raw.count
        guard !raw.isEmpty, padding<=6, bytes.dropFirst(raw.count).allSatisfy({$0==61}), [0,2,4,5,7].contains(raw.count%8), padding==0 || bytes.count%8==0 else {throw OTPError.invalidSecret}
        var value=0,bits=0,result=Data()
        for byte in raw {
            guard let n=alphabet.firstIndex(of:byte) else {throw OTPError.invalidSecret}
            value=(value<<5)|n;bits+=5
            if bits>=8 {bits-=8;result.append(UInt8((value>>bits)&255));value &= (1<<bits)-1}
        }
        guard value==0 else {throw OTPError.invalidSecret}
        return try SecretBytes(result)
    }
}
