// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "voidkoi",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "voidkoi", path: "Sources/voidkoi"),
    ],
    swiftLanguageModes: [.v5]
)
