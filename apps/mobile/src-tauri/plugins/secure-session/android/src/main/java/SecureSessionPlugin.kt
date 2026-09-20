package online.cdor.securesession

import android.app.Activity
import android.net.ConnectivityManager
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONArray
import app.tauri.plugin.Plugin
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class StoreArgs {
    var value: String? = null
}

@InvokeArg
class ResolveHostArgs {
    var host: String? = null
}

@TauriPlugin
class SecureSessionPlugin(private val activity: Activity) : Plugin(activity) {
    private val alias = "online.cdor.session"
    private val preferences by lazy {
        activity.getSharedPreferences("cdor_secure_session", Activity.MODE_PRIVATE)
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        ).run {
            init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            generateKey()
        }
    }

    @Command
    fun store(invoke: Invoke) {
        runCatching {
            val value = invoke.parseArgs(StoreArgs::class.java).value
                ?: error("missing value")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val ciphertext = cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
            preferences.edit()
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .commit()
            JSObject()
        }.onSuccess(invoke::resolve).onFailure { invoke.reject("secure store failed") }
    }

    @Command
    fun load(invoke: Invoke) {
        runCatching {
            val iv = preferences.getString("iv", null)
            val ciphertext = preferences.getString("ciphertext", null)
            val response = JSObject()
            if (iv != null && ciphertext != null) {
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
                )
                response.put(
                    "value",
                    String(
                        cipher.doFinal(Base64.decode(ciphertext, Base64.NO_WRAP)),
                        StandardCharsets.UTF_8
                    )
                )
            }
            response
        }.onSuccess(invoke::resolve).onFailure { invoke.reject("secure load failed") }
    }

    @Command
    fun delete(invoke: Invoke) {
        runCatching {
            preferences.edit().clear().commit()
            KeyStore.getInstance("AndroidKeyStore").apply {
                load(null)
                if (containsAlias(alias)) deleteEntry(alias)
            }
            JSObject()
        }.onSuccess(invoke::resolve).onFailure { invoke.reject("secure delete failed") }
    }

    @Command
    fun resolve_host(invoke: Invoke) {
        val host = runCatching {
            invoke.parseArgs(ResolveHostArgs::class.java).host
                ?: error("missing host")
        }.getOrElse {
            invoke.reject("host resolution failed")
            return
        }
        Thread {
            var response: JSObject? = null
            val connectivity =
                activity.getSystemService(ConnectivityManager::class.java)
            repeat(3) { attempt ->
                if (response == null) {
                    response = runCatching {
                        val network = connectivity.activeNetwork
                            ?: error("no active network")
                        JSObject().apply {
                            put(
                                "addresses",
                                JSONArray(
                                    network.getAllByName(host)
                                        .map { address -> address.hostAddress }
                                )
                            )
                        }
                    }.getOrNull()
                    if (response == null && attempt < 2) {
                        Thread.sleep(250L * (attempt + 1))
                    }
                }
            }
            activity.runOnUiThread {
                response?.let {
                    invoke.resolve(it)
                } ?: invoke.reject("host resolution failed")
            }
        }.start()
    }
}
