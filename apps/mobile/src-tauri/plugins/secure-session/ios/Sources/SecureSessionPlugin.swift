import Security
import Tauri
import WebKit

private final class StoreArgs: Decodable {
    let value: String
}

final class SecureSessionPlugin: Plugin {
    private let service = "online.cdor.session"
    private let account = "better-auth-bearer"

    private func query() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    @objc func store(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(StoreArgs.self)
        var item = query()
        SecItemDelete(item as CFDictionary)
        item[kSecValueData as String] = Data(args.value.utf8)
        item[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(item as CFDictionary, nil) == errSecSuccess else {
            invoke.reject("secure store failed")
            return
        }
        invoke.resolve([:])
    }

    @objc func load(_ invoke: Invoke) {
        var item = query()
        item[kSecReturnData as String] = true
        item[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(item as CFDictionary, &result)
        if status == errSecItemNotFound {
            invoke.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            invoke.reject("secure load failed")
            return
        }
        invoke.resolve(["value": value])
    }

    @objc func delete(_ invoke: Invoke) {
        let status = SecItemDelete(query() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            invoke.reject("secure delete failed")
            return
        }
        invoke.resolve([:])
    }
}

@_cdecl("init_plugin_secure_session")
func initPlugin() -> Plugin {
    SecureSessionPlugin()
}
