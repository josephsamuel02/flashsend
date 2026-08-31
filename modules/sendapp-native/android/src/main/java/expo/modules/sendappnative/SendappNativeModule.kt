package expo.modules.sendappnative

import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File

class SendappNativeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SendappNative")

    Function("getAppApkPath") {
      val context = appContext.reactContext
      context?.packageCodePath
    }

    Function("getAppApkPathForPackage") { packageName: String ->
      try {
        val context = appContext.reactContext ?: return@Function null
        val pm = context.packageManager
        val appInfo = pm.getApplicationInfo(packageName, 0)
        appInfo.sourceDir
      } catch (e: Exception) {
        null
      }
    }

    Function("getAppIconBase64") { packageName: String ->
      try {
        val context = appContext.reactContext ?: return@Function null
        val pm = context.packageManager
        val drawable = pm.getApplicationIcon(packageName)
        drawableToBase64(drawable)
      } catch (_: Exception) { null }
    }

    Function("getFileSize") { uri: String ->
      try {
        val context = appContext.reactContext ?: return@Function 0L
        val file = File(uri.replace("file://", ""))
        if (file.exists()) file.length()
        else {
          // Try content resolver for content:// URIs
          try {
            val cursor = context.contentResolver.query(android.net.Uri.parse(uri), null, null, null, null)
            cursor?.use {
              // No easy size; return 0
            }
            0L
          } catch (_: Exception) { 0L }
        }
      } catch (_: Exception) { 0L }
    }

    AsyncFunction("copyApkToCache") { packageName: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("React context not available")
        val pm = context.packageManager
        val appInfo = pm.getApplicationInfo(packageName, 0)
        val sourcePath = appInfo.sourceDir
        if (sourcePath.isNullOrEmpty()) {
          promise.reject("NO_APK", "APK path not found for $packageName", null)
          return@AsyncFunction
        }
        val sourceFile = File(sourcePath)
        if (!sourceFile.exists()) {
          promise.reject("NO_FILE", "APK file does not exist: $sourcePath", null)
          return@AsyncFunction
        }
        // Copy to cache for sharing via file:// that expo-file-system can read reliably
        val cacheDir = File(context.cacheDir, "apk_share")
        if (!cacheDir.exists()) cacheDir.mkdirs()
        // Sanitize package name for filename
        val safeName = packageName.replace(".", "_") + ".apk"
        val destFile = File(cacheDir, safeName)
        // If already cached and size matches, reuse
        if (destFile.exists() && destFile.length() == sourceFile.length()) {
          promise.resolve(destFile.absolutePath)
          return@AsyncFunction
        }
        sourceFile.inputStream().use { input ->
          destFile.outputStream().use { output ->
            input.copyTo(output)
          }
        }
        // Also handle split APKs (Android App Bundles) - copy those too if present
        val splitFiles = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          try {
            val splitSourceDirs = appInfo.splitSourceDirs
            if (splitSourceDirs != null) {
              for ((idx, splitPath) in splitSourceDirs.withIndex()) {
                try {
                  val splitFile = File(splitPath)
                  if (splitFile.exists()) {
                    val splitDest = File(cacheDir, "${packageName.replace(".", "_")}_split_${idx}.apk")
                    splitFile.inputStream().use { input -> splitDest.outputStream().use { output -> input.copyTo(output) } }
                    splitFiles.add(splitDest.absolutePath)
                  }
                } catch (_: Exception) {}
              }
            }
          } catch (_: Exception) {}
        }
        // Return main APK path; if splits exist, caller can handle them separately
        promise.resolve(destFile.absolutePath)
      } catch (e: Exception) {
        promise.reject("COPY_FAILED", "Failed to copy APK for $packageName: ${e.message}", e)
      }
    }

    Function("getApkSize") { packageName: String ->
      try {
        val context = appContext.reactContext ?: return@Function 0L
        val pm = context.packageManager
        val appInfo = pm.getApplicationInfo(packageName, 0)
        val f = File(appInfo.sourceDir)
        if (f.exists()) f.length() else 0L
      } catch (_: Exception) { 0L }
    }

    AsyncFunction("getInstalledApps") { promise: Promise ->
      try {
        val context = appContext.reactContext
          ?: throw Exception("React context not available - ensure app is running on device with dev-client")

        val pm = context.packageManager
        val appsMap = mutableMapOf<String, Map<String, Any?>>()

        // ── Primary: queryIntentActivities for LAUNCHER (works with <queries> on API 30+, no QUERY_ALL_PACKAGES needed) ──
        try {
          val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
          val resolveInfos = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.queryIntentActivities(launcherIntent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
          } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(launcherIntent, PackageManager.MATCH_DEFAULT_ONLY)
          }
          for (ri in resolveInfos) {
            try {
              val pkg = ri.activityInfo?.packageName ?: continue
              if (appsMap.containsKey(pkg)) continue
              val appInfo = try { pm.getApplicationInfo(pkg, 0) } catch (_: Exception) { continue }
              val label = try { pm.getApplicationLabel(appInfo).toString() } catch (_: Exception) { pkg }
              if (label.isBlank() || pkg.isBlank()) continue
              val iconBase64 = try {
                val d = pm.getApplicationIcon(pkg)
                drawableToBase64(d)
              } catch (_: Exception) { null }
              appsMap[pkg] = mapOf(
                "name" to label,
                "packageName" to pkg,
                "icon" to appInfo.icon,
                "iconBase64" to iconBase64
              )
            } catch (_: Exception) {}
          }
        } catch (_: Exception) {
          // fall through to fallback
        }

        // ── Fallback: getInstalledApplications filtered by launchable (needs QUERY_ALL_PACKAGES or correct <queries>) ──
        if (appsMap.isEmpty()) {
          @Suppress("DEPRECATION")
          val packages = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getInstalledApplications(PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()))
          } else {
            pm.getInstalledApplications(PackageManager.GET_META_DATA)
          }
          for (appInfo in packages) {
            try {
              if (appsMap.containsKey(appInfo.packageName)) continue
              if (pm.getLaunchIntentForPackage(appInfo.packageName) == null) continue
              val label = try { pm.getApplicationLabel(appInfo).toString() } catch (_: Exception) { appInfo.packageName }
              if (label.isBlank() || appInfo.packageName.isBlank()) continue
              val iconBase64 = try {
                val d = pm.getApplicationIcon(appInfo.packageName)
                drawableToBase64(d)
              } catch (_: Exception) { null }
              appsMap[appInfo.packageName] = mapOf(
                "name" to label,
                "packageName" to appInfo.packageName,
                "icon" to appInfo.icon,
                "iconBase64" to iconBase64
              )
            } catch (_: Exception) {}
          }
        }

        val sorted = appsMap.values.sortedBy { (it["name"] as String).lowercase() }
        promise.resolve(sorted)
      } catch (e: Exception) {
        promise.reject("ERROR_FETCHING_APPS", "Failed to fetch installed apps: ${e.message}", e)
      }
    }
  }

  private fun drawableToBase64(drawable: Drawable): String? {
    return try {
      val bitmap: Bitmap = when (drawable) {
        is BitmapDrawable -> {
          drawable.bitmap?.let {
            // Scale to 96x96 for consistent size
            if (it.width == 96 && it.height == 96) it
            else Bitmap.createScaledBitmap(it, 96, 96, true)
          } ?: run {
            val b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
            val c = Canvas(b)
            drawable.setBounds(0, 0, 96, 96)
            drawable.draw(c)
            b
          }
        }
        is AdaptiveIconDrawable -> {
          val b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
          val c = Canvas(b)
          drawable.setBounds(0, 0, 96, 96)
          drawable.draw(c)
          b
        }
        else -> {
          val b = Bitmap.createBitmap(96, 96, Bitmap.Config.ARGB_8888)
          val c = Canvas(b)
          drawable.setBounds(0, 0, 96, 96)
          drawable.draw(c)
          b
        }
      }
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    } catch (_: Exception) { null }
  }
}
