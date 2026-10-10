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
    public static func parse(_ input: String) throws -> ImportCandidate { throw ImportError.malformed }
}
public enum MigrationDecoder {
    public static func decode(_ input: String) throws -> MigrationPart { throw ImportError.malformed }
}
public struct BatchProgress: Equatable { public let receivedPartCount: Int; public let totalPartCount: Int; public let isComplete: Bool }
public struct MigrationBatchCollector {
    public init() {}
    public mutating func accept(_ part: MigrationPart) throws -> BatchProgress { throw ImportError.malformed }
    public func result() throws -> ([ImportCandidate],[ImportIssue]) { throw ImportError.incomplete }
    public mutating func reset() {}
}
public struct ImportPreview {
    public let candidates: [ImportCandidate]
    public let duplicates: [ImportCandidate]
    public let issues: [ImportIssue]
    public init(candidates:[ImportCandidate],existing:[OTPAccount],issues:[ImportIssue] = []) {self.candidates=candidates;self.duplicates=[];self.issues=issues}
}
