// swift-tools-version: 6.0
import PackageDescription
let package = Package(
    name: "AuthBandCore",
    platforms: [.iOS("27.0"), .macOS(.v13)],
    products: [.library(name: "AuthBandCore", targets: ["AuthBandCore"])],
    dependencies: [.package(url: "https://github.com/apple/swift-crypto.git", exact: "4.5.1")],
    targets: [
        .target(name: "AuthBandCore", dependencies: [.product(name: "Crypto", package: "swift-crypto")]),
        .testTarget(name: "AuthBandCoreTests", dependencies: ["AuthBandCore"])
    ],
    swiftLanguageModes: [.v5]
)
