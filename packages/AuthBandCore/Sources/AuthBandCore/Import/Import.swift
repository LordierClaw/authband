import Foundation
public enum ImportError: Error { case malformed, unsupported, tooLarge, conflictingBatch, incomplete }
public struct ImportCandidate: Equatable, Sendable {
    public var issuer: String
    public var label: String
    public var secret: SecretBytes
    public var parameters: OTPParameters
    public init(issuer: String, label: String, secret: SecretBytes, parameters: OTPParameters) {self.issuer=issuer;self.label=label;self.secret=secret;self.parameters=parameters}
}
public struct ImportIssue: Equatable, Sendable { public let index: Int; public let reason: String }
public struct MigrationPart: Equatable, Sendable {
    public let version: Int
    public let batchID: Int
    public let batchSize: Int
    public let batchIndex: Int
    public let candidates: [ImportCandidate]
    public let issues: [ImportIssue]
    public let raw: Data
}
public enum OTPAuthParser {
    public static func parse(_ input: String) throws -> ImportCandidate {
        let (url,query)=try importURL(input)
        guard url.scheme?.lowercased()=="otpauth",url.host?.lowercased()=="totp" else {throw ImportError.unsupported}
        guard let secret=query["secret"],url.path.hasPrefix("/"),url.path.count>1 else {throw ImportError.malformed}
        let label=String(url.path.dropFirst()),parts=label.split(separator:":",maxSplits:1,omittingEmptySubsequences:false)
        let prefix=parts.count==2 ? String(parts[0]).trimmingCharacters(in:.whitespaces):""
        let name=(parts.count==2 ? String(parts[1]):label).trimmingCharacters(in:.whitespaces)
        let issuer=query["issuer"] ?? prefix
        guard prefix.isEmpty || issuer==prefix,let algorithm=OTPAlgorithm(rawValue:(query["algorithm"] ?? "sha1").lowercased()),let digits=Int(query["digits"] ?? "6"),let period=Int(query["period"] ?? "30"),!name.isEmpty,name.utf8.count<=256,issuer.utf8.count<=256 else {throw ImportError.malformed}
        return try ImportCandidate(issuer:issuer,label:name,secret:Base32.decode(secret),parameters:OTPParameters(algorithm:algorithm,digits:digits,period:period))
    }
}
public enum MigrationDecoder {
    public static func decode(_ input: String) throws -> MigrationPart {
        let (url,query)=try importURL(input)
        guard url.scheme=="otpauth-migration",url.host=="offline",url.path.isEmpty || url.path=="/",let encoded=query["data"],let bytes=Data(base64Encoded:encoded),bytes.count<=16384 else {throw ImportError.malformed}
        let fields=try ProtoReader(data:bytes).allFields()
        let version=try fields.scalar(2,default:0),size=try fields.scalar(3,default:1),index=try fields.scalar(4,default:0),batchID=try fields.scalar(5,default:0)
        guard version==1,(1...32).contains(size),index<size else {throw ImportError.unsupported}
        var candidates:[ImportCandidate]=[],issues:[ImportIssue]=[],recordIndex=0
        for field in fields {
            switch field {
            case .varint(let number,_),.fixed32(let number,_),.fixed64(let number,_):if number==1{throw ImportError.malformed}
            default:break
            }
            guard case .bytes(let number,let raw)=field,number==1 else {continue}
            guard recordIndex<100 else {throw ImportError.tooLarge}
            do {
                let row=try ProtoReader(data:raw).allFields()
                let alg=try row.scalar(4,default:0),digits=try row.scalar(5,default:0),type=try row.scalar(6,default:0)
                guard type==2,(1...3).contains(alg),(1...2).contains(digits) else {throw ImportError.unsupported}
                let secret=try SecretBytes(row.blob(1) ?? Data())
                guard let name=String(data:try row.blob(2) ?? Data(),encoding:.utf8),let issuer=String(data:try row.blob(3) ?? Data(),encoding:.utf8),!name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,name.utf8.count<=256,issuer.utf8.count<=256 else {throw ImportError.malformed}
                let label=(!issuer.isEmpty && name.hasPrefix(issuer+":")) ? String(name.dropFirst(issuer.count+1)).trimmingCharacters(in:.whitespaces):name
                guard !label.isEmpty else {throw ImportError.malformed}
                candidates.append(try ImportCandidate(issuer:issuer,label:label,secret:secret,parameters:OTPParameters(algorithm:[.sha1,.sha256,.sha512][Int(alg)-1],digits:digits==1 ? 6:8)))
            } catch {issues.append(ImportIssue(index:recordIndex,reason:"Tài khoản không hợp lệ hoặc không hỗ trợ TOTP"))}
            recordIndex+=1
        }
        guard recordIndex>0 else {throw ImportError.malformed}
        return MigrationPart(version:1,batchID:Int(Int32(truncatingIfNeeded:batchID)),batchSize:Int(size),batchIndex:Int(index),candidates:candidates,issues:issues,raw:bytes)
    }
}
public struct BatchProgress: Equatable { public let receivedPartCount: Int; public let totalPartCount: Int; public let isComplete: Bool }
public struct MigrationBatchCollector {
    private var parts:[Int:MigrationPart]=[:]
    public init() {}
    public mutating func accept(_ part: MigrationPart) throws -> BatchProgress {
        guard part.version==1,(1...32).contains(part.batchSize),(0..<part.batchSize).contains(part.batchIndex) else {throw ImportError.malformed}
        if let first=parts.values.first {guard first.version==part.version,first.batchID==part.batchID,first.batchSize==part.batchSize else {throw ImportError.conflictingBatch}}
        if let old=parts[part.batchIndex] {guard old.raw==part.raw else {throw ImportError.conflictingBatch}}
        var proposed=parts;proposed[part.batchIndex]=part
        guard proposed.values.reduce(0,{$0+$1.raw.count})<=131072,proposed.values.reduce(0,{$0+$1.candidates.count+$1.issues.count})<=100 else {throw ImportError.tooLarge}
        parts=proposed
        return BatchProgress(receivedPartCount:parts.count,totalPartCount:part.batchSize,isComplete:parts.count==part.batchSize)
    }
    public func result() throws -> ([ImportCandidate],[ImportIssue]) {
        guard let first=parts.values.first,parts.count==first.batchSize else {throw ImportError.incomplete}
        let ordered=parts.keys.sorted().compactMap{parts[$0]}
        return (ordered.flatMap(\.candidates),ordered.flatMap(\.issues))
    }
    public mutating func reset() {parts=[:]}
}
public struct ImportPreview {
    public let candidates: [ImportCandidate]
    public let duplicates: [ImportCandidate]
    public let issues: [ImportIssue]
    public init(candidates:[ImportCandidate],existing:[OTPAccount],issues:[ImportIssue] = []) {
        var accepted:[ImportCandidate]=[],duplicates:[ImportCandidate]=[]
        for item in candidates {
            if existing.contains(where:{$0.secret==item.secret && $0.parameters==item.parameters}) || accepted.contains(where:{$0.secret==item.secret && $0.parameters==item.parameters}) {duplicates.append(item)} else {accepted.append(item)}
        }
        self.candidates=accepted;self.duplicates=duplicates;self.issues=issues
    }
}

private func importURL(_ input:String) throws -> (URLComponents,[String:String]) {
    guard input.utf8.count<=16384 else {throw ImportError.tooLarge}
    guard let url=URLComponents(string:input),url.user==nil,url.password==nil,url.port==nil,url.fragment==nil else {throw ImportError.malformed}
    var query:[String:String]=[:]
    for item in url.queryItems ?? [] {let key=item.name.lowercased();guard query[key]==nil,let value=item.value else {throw ImportError.malformed};query[key]=value}
    return (url,query)
}
private extension Array where Element==ProtoField {
    func scalar(_ number:Int,default fallback:UInt64) throws -> UInt64 {
        var result:UInt64?
        for field in self {
            switch field {
            case .varint(let n,let v) where n==number:guard result==nil else {throw ImportError.malformed};result=v
            case .bytes(let n,_) where n==number:throw ImportError.malformed
            case .fixed32(let n,_) where n==number:throw ImportError.malformed
            case .fixed64(let n,_) where n==number:throw ImportError.malformed
            default:break
            }
        }
        return result ?? fallback
    }
    func blob(_ number:Int) throws -> Data? {
        var result:Data?
        for field in self {
            switch field {
            case .bytes(let n,let v) where n==number:guard result==nil else {throw ImportError.malformed};result=v
            case .varint(let n,_) where n==number:throw ImportError.malformed
            case .fixed32(let n,_) where n==number:throw ImportError.malformed
            case .fixed64(let n,_) where n==number:throw ImportError.malformed
            default:break
            }
        }
        return result
    }
}
