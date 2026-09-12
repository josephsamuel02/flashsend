package expo.modules.sendappnative

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Environment
import android.util.Base64
import android.webkit.MimeTypeMap
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
              val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0 || (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
              val iconBase64 = try {
                val d = pm.getApplicationIcon(pkg)
                drawableToBase64(d)
              } catch (_: Exception) { null }
              appsMap[pkg] = mapOf(
                "name" to label,
                "packageName" to pkg,
                "icon" to appInfo.icon,
                "iconBase64" to iconBase64,
                "isSystemApp" to isSystem
              )
            } catch (_: Exception) {}
          }
        } catch (_: Exception) {
          // fall through to fallback
        }

        // ── Merge: getInstalledApplications filtered by launchable ──
        // Always merge (not only when empty): queryIntentActivities is subject
        // to package-visibility filtering on API 30+ and can miss apps, so
        // union with the full installed list to show every launchable app.
        run {
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
              val isSystem = (appInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0 || (appInfo.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0
              val iconBase64 = try {
                val d = pm.getApplicationIcon(appInfo.packageName)
                drawableToBase64(d)
              } catch (_: Exception) { null }
              appsMap[appInfo.packageName] = mapOf(
                "name" to label,
                "packageName" to appInfo.packageName,
                "icon" to appInfo.icon,
                "iconBase64" to iconBase64,
                "isSystemApp" to isSystem
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

    // ── File system browsing for Files tab ──
    Function("getStorageRoots") {
      val roots = mutableListOf<Map<String, Any?>>()
      try {
        val ext = Environment.getExternalStorageDirectory()
        if (ext != null && ext.exists()) {
          roots.add(mapOf(
            "name" to "Internal Storage",
            "path" to ext.absolutePath,
            "type" to "external",
            "readable" to ext.canRead(),
            "writable" to ext.canWrite()
          ))
        }
      } catch (_: Exception) {}
      try {
        val ctx = appContext.reactContext
        if (ctx != null) {
          val privateDir = ctx.filesDir
          roots.add(mapOf(
            "name" to "App Private",
            "path" to privateDir.absolutePath,
            "type" to "private",
            "readable" to true,
            "writable" to true
          ))
          ctx.getExternalFilesDir(null)?.let { ef ->
            // Add FlashSend root if exists or can be created
            val flash = getFlashSendRootFile()
            roots.add(mapOf(
              "name" to "FlashSend",
              "path" to flash.absolutePath,
              "type" to "flashsend",
              "readable" to true,
              "writable" to true
            ))
          }
          // Common public dirs
          val commonNames = listOf("DCIM", "Pictures", "Movies", "Music", "Download", "Documents")
          val extRoot = Environment.getExternalStorageDirectory()
          for (n in commonNames) {
            try {
              val f = File(extRoot, n)
              if (f.exists() && f.isDirectory) {
                roots.add(mapOf(
                  "name" to n,
                  "path" to f.absolutePath,
                  "type" to "public",
                  "readable" to f.canRead(),
                  "writable" to f.canWrite()
                ))
              }
            } catch (_: Exception) {}
          }
        }
      } catch (_: Exception) {}
      roots
    }

    AsyncFunction("listDirectory") { path: String, promise: Promise ->
      try {
        val targetPath = if (path.isBlank() || path == "ROOT") {
          Environment.getExternalStorageDirectory().absolutePath
        } else path

        val dir = File(targetPath)
        if (!dir.exists()) {
          promise.reject("NOT_FOUND", "Path does not exist: $targetPath", null)
          return@AsyncFunction
        }
        if (!dir.isDirectory) {
          promise.reject("NOT_DIR", "Not a directory: $targetPath", null)
          return@AsyncFunction
        }
        if (!dir.canRead()) {
          promise.reject("NO_PERMISSION", "Cannot read directory: $targetPath. Grant storage permission.", null)
          return@AsyncFunction
        }
        val files = dir.listFiles()
        if (files == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@AsyncFunction
        }
        val entries = files.mapNotNull { f ->
          try {
            val isDir = f.isDirectory
            val name = f.name
            // Skip hidden dot files unless they are visible dirs?
            // Keep all but hide .thumbnails etc? Include all for completeness.
            val size = if (isDir) 0L else try { f.length() } catch (_: Exception) { 0L }
            val modified = try { f.lastModified() } catch (_: Exception) { 0L }
            val ext = name.substringAfterLast('.', "").lowercase()
            val mime = if (isDir) "inode/directory"
                      else try {
                        val m = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
                        m ?: when (ext) {
                          "apk" -> "application/vnd.android.package-archive"
                          "pdf" -> "application/pdf"
                          "zip", "rar", "7z" -> "application/zip"
                          "doc", "docx" -> "application/msword"
                          "xls", "xlsx" -> "application/vnd.ms-excel"
                          "ppt", "pptx" -> "application/vnd.ms-powerpoint"
                          "txt" -> "text/plain"
                          "mp3", "wav", "ogg", "m4a", "flac" -> "audio/*"
                          "mp4", "mkv", "avi", "mov", "wmv" -> "video/*"
                          "jpg", "jpeg", "png", "gif", "webp", "bmp" -> "image/*"
                          else -> "application/octet-stream"
                        } ?: "application/octet-stream"
                      } catch (_: Exception) { "application/octet-stream" }

            // For dirs, count children (cheap)
            val childCount = if (isDir) try { f.listFiles()?.size ?: 0 } catch (_: Exception) { 0 } else 0

            mapOf(
              "name" to name,
              "path" to f.absolutePath,
              "isDirectory" to isDir,
              "size" to size,
              "mimeType" to mime,
              "modified" to modified,
              "extension" to ext,
              "childCount" to childCount,
              "readable" to f.canRead(),
              "hidden" to name.startsWith(".")
            )
          } catch (_: Exception) { null }
        }
        // Return unsorted; JS will sort folders first + files biggest first
        promise.resolve(entries)
      } catch (e: Exception) {
        promise.reject("LIST_FAILED", "Failed to list $path: ${e.message}", e)
      }
    }

    Function("getFlashSendBaseDir") {
      try {
        val root = getFlashSendRootFile()
        root.absolutePath
      } catch (e: Exception) { null }
    }

    AsyncFunction("ensureFlashSendDirs") { promise: Promise ->
      try {
        val root = getFlashSendRootFile()
        if (!root.exists()) root.mkdirs()
        val subs = listOf("Images", "Videos", "Apps", "Documents", "Audio", "Files")
        val result = mutableMapOf<String, String>()
        result["root"] = root.absolutePath
        for (sub in subs) {
          val dir = File(root, sub)
          if (!dir.exists()) dir.mkdirs()
          result[sub] = dir.absolutePath
          result[sub.lowercase()] = dir.absolutePath
        }
        // also expose lowercase keys for JS convenience
        result["images"] = result["Images"]!!
        result["videos"] = result["Videos"]!!
        result["apps"] = result["Apps"]!!
        result["documents"] = result["Documents"]!!
        result["audio"] = result["Audio"]!!
        result["files"] = result["Files"]!!
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject("ENSURE_FAILED", "Failed to ensure FlashSend dirs: ${e.message}", e)
      }
    }

    Function("getCategorizedSubfolder") { mimeType: String, fileName: String ->
      getCategorizedSubfolderName(mimeType ?: "", fileName ?: "")
    }

    Function("getDestPathForFile") { mimeType: String, fileName: String ->
      try {
        val sub = getCategorizedSubfolderName(mimeType ?: "", fileName ?: "")
        val root = getFlashSendRootFile()
        val dir = File(root, sub)
        if (!dir.exists()) dir.mkdirs()
        // return dir path with trailing slash for JS to append filename
        dir.absolutePath + "/"
      } catch (_: Exception) {
        null
      }
    }

    AsyncFunction("shareFileToApp") { fileUri: String, mimeType: String, packageName: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("React context not available")
        val type = if (mimeType.isNullOrBlank()) "*/*" else mimeType
        val contentUri: android.net.Uri = if (fileUri.startsWith("content://")) {
          android.net.Uri.parse(fileUri)
        } else {
          val path = fileUri.replace("file://", "")
          val file = File(path)
          if (!file.exists()) {
            promise.reject("NO_FILE", "File not found: $path", null)
            return@AsyncFunction
          }
          try {
            androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
          } catch (_: Exception) {
            // Fallback to raw file uri if FileProvider not configured
            android.net.Uri.fromFile(file)
          }
        }
        val intent = Intent(Intent.ACTION_SEND).apply {
          this.type = type
          putExtra(Intent.EXTRA_STREAM, contentUri)
          setPackage(packageName)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val pm = context.packageManager
        val handlers = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(PackageManager.MATCH_DEFAULT_ONLY.toLong()))
        } else {
          @Suppress("DEPRECATION")
          pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY)
        }
        if (handlers.isEmpty()) {
          promise.reject("NOT_INSTALLED", "Target app is not installed", null)
          return@AsyncFunction
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("SHARE_FAILED", "Share failed: ${e.message}", e)
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

  private fun getFlashSendRootFile(): File {
    val ctx = appContext.reactContext
    // Prefer public external FlashSend (/storage/emulated/0/FlashSend) if writable
    try {
      val extRoot = Environment.getExternalStorageDirectory()
      if (extRoot != null && extRoot.exists() && Environment.getExternalStorageState() == Environment.MEDIA_MOUNTED) {
        val publicFlash = File(extRoot, "FlashSend")
        // Try to ensure it exists or can be created
        try {
          if (!publicFlash.exists()) publicFlash.mkdirs()
          if (publicFlash.exists() && publicFlash.canWrite()) return publicFlash
        } catch (_: Exception) {}
      }
    } catch (_: Exception) {}
    // Fallback to app external files dir
    try {
      ctx?.getExternalFilesDir(null)?.let { ef ->
        // Go up to external storage app folder, then use FlashSend there
        val fallback = File(ef, "FlashSend")
        if (!fallback.exists()) fallback.mkdirs()
        if (fallback.exists()) return fallback
      }
    } catch (_: Exception) {}
    // Final fallback internal
    val internal = ctx?.filesDir ?: File("/data/data/com.flashsend.app/files")
    val flash = File(internal, "FlashSend")
    if (!flash.exists()) flash.mkdirs()
    return flash
  }

  private fun getCategorizedSubfolderName(mimeType: String, fileName: String): String {
    val mime = mimeType.lowercase()
    val name = fileName.lowercase()
    val ext = name.substringAfterLast('.', "")
    // Images
    if (mime.startsWith("image/") || ext in listOf("jpg","jpeg","png","gif","webp","bmp","heic","heif","svg","tiff")) return "Images"
    // Videos
    if (mime.startsWith("video/") || ext in listOf("mp4","mkv","avi","mov","wmv","flv","webm","m4v","3gp","ts")) return "Videos"
    // Audio
    if (mime.startsWith("audio/") || ext in listOf("mp3","wav","ogg","m4a","flac","aac","wma","opus")) return "Audio"
    // Apps / APK
    if (mime == "application/vnd.android.package-archive" || ext == "apk" || ext == "xapk" || ext == "apks") return "Apps"
    // Documents
    if (mime == "application/pdf" || mime.contains("msword") || mime.contains("officedocument") || mime.contains("spreadsheet") || mime.contains("presentation") || mime.startsWith("text/") || ext in listOf("pdf","doc","docx","xls","xlsx","ppt","pptx","txt","csv","rtf","odt","ods","odp","zip","rar","7z","tar","gz","json","xml","html","htm")) return "Documents"
    // Fallback generic
    return "Files"
  }
}
