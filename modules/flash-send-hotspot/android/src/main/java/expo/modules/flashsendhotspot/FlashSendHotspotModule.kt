package expo.modules.flashsendhotspot

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FlashSendHotspotModule : Module() {
  private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
  private var isStarting = false

  override fun definition() = ModuleDefinition {
    Name("FlashSendHotspot")

    Function("isHotspotSupported") {
      // startLocalOnlyHotspot requires API 26+ and is Android-only
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
    }

    AsyncFunction("startHotspot") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.reject("UNSUPPORTED", "Hotspot requires Android 8.0 (API 26) or higher", null)
        return@AsyncFunction
      }
      if (isStarting) {
        promise.reject("ALREADY_STARTING", "Hotspot start already in progress", null)
        return@AsyncFunction
      }
      if (reservation != null) {
        // Already have one — close stale one first
        try { reservation?.close() } catch (_: Exception) {}
        reservation = null
      }

      val context = appContext.reactContext ?: run {
        promise.reject("NO_CONTEXT", "React context not available", null)
        return@AsyncFunction
      }

      val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
        ?: run {
          promise.reject("NO_WIFI_SERVICE", "WifiManager not available", null)
          return@AsyncFunction
        }

      isStarting = true

      try {
        wifiManager.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
          override fun onStarted(res: WifiManager.LocalOnlyHotspotReservation) {
            reservation = res
            isStarting = false
            try {
              val ssid: String?
              val password: String?
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val softAp = res.softApConfiguration
                // SoftApConfiguration fields are plain strings (no quotes)
                ssid = softAp?.ssid
                // passphrase can be null on some devices if open network (shouldn't happen for LOHS)
                password = softAp?.passphrase
              } else {
                @Suppress("DEPRECATION")
                val wifiConf = res.wifiConfiguration
                // WifiConfiguration fields are wrapped in literal double-quotes ("MyNetwork") — strip them for QR payload
                ssid = wifiConf?.SSID?.removeSurrounding("\"")
                @Suppress("DEPRECATION")
                password = wifiConf?.preSharedKey?.removeSurrounding("\"")
              }
              if (ssid.isNullOrEmpty()) {
                promise.reject("NO_SSID", "Hotspot started but SSID is empty", null)
                return
              }
              // LocalOnlyHotspot is WPA2-secured, password should be present
              promise.resolve(
                mapOf(
                  "ssid" to ssid,
                  "password" to (password ?: "")
                )
              )
            } catch (e: Exception) {
              promise.reject("PARSE_FAILED", "Failed to read hotspot config: ${e.message}", e)
            }
          }

          override fun onStopped() {
            reservation = null
            isStarting = false
          }

          override fun onFailed(reason: Int) {
            reservation = null
            isStarting = false
            val msg = when (reason) {
              ERROR_TETHERING_DISALLOWED -> "Tethering disallowed (carrier/policy)"
              ERROR_INCOMPATIBLE_MODE -> "Incompatible WiFi mode (already in hotspot/p2p mode)"
              else -> "Hotspot failed (reason=$reason)"
            }
            // Only reject if promise not already settled — use handler to avoid double-resolve
            try {
              promise.reject("HOTSPOT_FAILED", msg, null)
            } catch (_: Exception) {}
          }
        }, Handler(Looper.getMainLooper()))
      } catch (e: SecurityException) {
        isStarting = false
        promise.reject("PERMISSION_DENIED", "Missing permissions for hotspot: ${e.message}. Ensure CHANGE_WIFI_STATE/NEARBY_WIFI_DEVICES/ACCESS_FINE_LOCATION (API <=32) and Location Services on.", e)
      } catch (e: Exception) {
        isStarting = false
        promise.reject("START_FAILED", "Failed to start hotspot: ${e.message}", e)
      }
    }

    Function("stopHotspot") {
      try {
        reservation?.close()
      } catch (_: Exception) {}
      reservation = null
      isStarting = false
    }

    // Ensure cleanup on module destroy
    OnDestroy {
      try { reservation?.close() } catch (_: Exception) {}
      reservation = null
    }
  }
}
