// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "tauri-plugin-secure-session",
    platforms: [.iOS(.v13)],
    products: [
        .library(
            name: "tauri-plugin-secure-session",
            type: .static,
            targets: ["tauri-plugin-secure-session"]
        )
    ],
    dependencies: [.package(name: "Tauri", path: "../.tauri/tauri-api")],
    targets: [
        .target(
            name: "tauri-plugin-secure-session",
            dependencies: [.byName(name: "Tauri")],
            path: "Sources"
        )
    ]
)
