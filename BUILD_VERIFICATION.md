# Flash Send - Build Verification Guide

## Overview
This document provides a comprehensive checklist for building and verifying the Flash Send Android app.

## Prerequisites

### Required Software
- **Node.js**: v18+ or v20+ (LTS recommended)
- **npm** or **yarn**: Latest version
- **Java JDK**: Version 17 (for Android Gradle 8+)
- **Android SDK**: API Level 34 (Android 14)
- **Android Studio**: Latest stable version
- **Expo CLI**: Installed globally (`npm install -g expo-cli`)

### Environment Variables
Ensure these are set in your system:
```bash
ANDROID_HOME=/path/to/Android/sdk
JAVA_HOME=/path/to/java/jdk-17
```

## Build Steps

### 1. Install Dependencies
```bash
npm install
# or
yarn install
```

### 2. Prebuild (Generate Native Projects)
```bash
npx expo prebuild --clean
```

This command:
- Generates `android/` directory with native code
- Applies Expo config plugins (withHotspotPermissions, withAppQueries)
- Links native modules (sendapp-native, flash-send-hotspot)
- Configures AndroidManifest.xml with all permissions

### 3. Build Development Client
```bash
npx expo run:android
```

Or for release build:
```bash
cd android
./gradlew assembleRelease
```

## Critical Configurations to Verify

### 1. Permissions (app.json)
Verify these permissions are in `app.json` and appear in generated `AndroidManifest.xml`:

**Required Permissions:**
- ✅ `READ_MEDIA_IMAGES` (Android 13+ for photos)
- ✅ `READ_MEDIA_VIDEO` (Android 13+ for videos)
- ✅ `READ_MEDIA_AUDIO` (Android 13+ for audio)
- ✅ `READ_EXTERNAL_STORAGE` (Android 12 and below)
- ✅ `ACCESS_WIFI_STATE` (WiFi network info)
- ✅ `CHANGE_WIFI_STATE` (WiFi control)
- ✅ `NEARBY_WIFI_DEVICES` (Android 13+ for WiFi/hotspot)
- ✅ `ACCESS_FINE_LOCATION` (Android 12 and below for WiFi/hotspot)
- ✅ `CAMERA` (QR code scanning)
- ✅ `WAKE_LOCK` (Keep screen awake during transfer)
- ✅ `REQUEST_INSTALL_PACKAGES` (APK installation)
- ✅ `QUERY_ALL_PACKAGES` (See all installed apps)
- ✅ `INTERNET` (Network communication)

**Removed/Blocked Permissions:**
- ❌ `BLUETOOTH*` (Not used)
- ❌ `POST_NOTIFICATIONS` (Not needed)
- ❌ `FOREGROUND_SERVICE*` (Not needed)

### 2. Native Modules
Verify both native modules are properly linked:

**flash-send-hotspot:**
- Location: `modules/flash-send-hotspot/`
- Purpose: Creates LocalOnlyHotspot for file sharing
- Functions: `isHotspotSupported()`, `startHotspot()`, `stopHotspot()`

**sendapp-native:**
- Location: `modules/sendapp-native/`
- Purpose: App listing, file operations, APK handling
- Functions: `getInstalledApps()`, `copyApkToCache()`, `listDirectory()`, etc.

Verification:
```bash
# Check if modules are in package.json
grep -A1 "flash-send-hotspot\|sendapp-native" package.json

# After prebuild, verify they're linked in android/settings.gradle
cat android/settings.gradle | grep -E "flash-send-hotspot|sendapp-native"
```

### 3. Config Plugins
Two custom plugins should be active:

**withHotspotPermissions.js:**
- Adds `NEARBY_WIFI_DEVICES` with `neverForLocation` flag
- Adds `ACCESS_FINE_LOCATION` with `maxSdkVersion="32"`
- Enables cleartext traffic for local HTTP

**withAppQueries.js:**
- Adds `<queries><intent>` for `ACTION_MAIN` + `CATEGORY_LAUNCHER`
- Allows app to see installed launchable apps without `QUERY_ALL_PACKAGES`

Verification after prebuild:
```bash
# Check generated AndroidManifest.xml
cat android/app/src/main/AndroidManifest.xml | grep -A3 "queries\|NEARBY_WIFI\|usesCleartextTraffic"
```

### 4. Gradle Configuration
Verify `android/build.gradle` settings:
- `compileSdkVersion 34`
- `minSdkVersion 21` (Android 5.0+)
- `targetSdkVersion 34` (Android 14)
- Kotlin version: 1.8.10+

### 5. Network Configuration
Verify `usesCleartextTraffic="true"` is set in AndroidManifest for local HTTP server.

## Common Build Issues and Fixes

### Issue 1: Native Modules Not Found
**Error:** `Module 'SendappNative' or 'FlashSendHotspot' not found`

**Fix:**
```bash
# Clean and rebuild
npx expo prebuild --clean
npx expo run:android
```

### Issue 2: Permission Errors at Runtime
**Error:** "Location permission denied" or "Nearby devices permission denied"

**Fix:**
- Verify permissions in `app.json` match those in this document
- Check `withHotspotPermissions.js` is properly applied
- Clear app data and reinstall

### Issue 3: Apps Tab Shows No Apps
**Error:** No apps appear in Apps tab

**Possible Causes:**
1. `QUERY_ALL_PACKAGES` not granted
2. `<queries>` intent not in manifest
3. Native module not linked

**Fix:**
```bash
# Verify queries in manifest
cat android/app/src/main/AndroidManifest.xml | grep -A5 queries

# If missing, ensure withAppQueries.js is in plugins array in app.json
# Then rebuild:
npx expo prebuild --clean
```

### Issue 4: Hotspot Creation Fails
**Error:** "Hotspot failed" or "Incompatible mode"

**Common Causes:**
1. Location services disabled (Android ≤12)
2. Permission not granted
3. Another hotspot already active
4. Carrier/OEM restrictions

**Fix:**
1. Enable Location in Quick Settings (Android ≤12)
2. Grant all permissions in Settings → Apps → Flash Send
3. Disable any active hotspot/tethering
4. Restart device if persists

### Issue 5: Port Already in Use
**Error:** "Port 42124 already in use"

**Fix:**
- Close all other instances of Flash Send
- Force stop the app: Settings → Apps → Flash Send → Force Stop
- Restart device if persists

### Issue 6: File Transfer Fails
**Error:** "Network request failed" or "Connection timeout"

**Troubleshooting:**
1. Verify both devices on same WiFi or receiver joined hotspot
2. Check WiFi signal strength
3. Disable Mobile Data on receiver (for hotspot scenarios)
4. Move devices closer together
5. Restart WiFi on both devices

## Testing Checklist

### Pre-Release Testing

#### 1. Permissions Testing
- [ ] Camera permission requested when scanning QR
- [ ] Location/Nearby Devices requested when creating hotspot
- [ ] Media permissions requested when accessing photos/videos
- [ ] Storage permission requested when saving files

#### 2. Hotspot Testing (Android 8.0+)
- [ ] Hotspot creates successfully
- [ ] Receiver can scan QR and auto-join hotspot
- [ ] File transfer works over hotspot
- [ ] Hotspot closes when sender leaves screen

#### 3. WiFi Testing
- [ ] Both devices on same WiFi can transfer files
- [ ] IP detection works correctly
- [ ] Server starts on port 42124

#### 4. File Selection Testing
- [ ] Apps tab shows installed apps
- [ ] Photos tab shows gallery images
- [ ] Videos tab shows videos
- [ ] Audio tab shows music
- [ ] Files tab allows browsing directories
- [ ] Selection persists across tabs

#### 5. Transfer Testing
- [ ] Single file transfers successfully
- [ ] Multiple files transfer in parallel
- [ ] Large files (>100MB) transfer without crashing
- [ ] Progress updates correctly
- [ ] Speed calculation works
- [ ] Retry works for failed files
- [ ] Cancel stops transfer

#### 6. APK Testing
- [ ] APK files are selectable from Apps tab
- [ ] APK copies to cache successfully
- [ ] APK transfers to receiver
- [ ] Receiver can install APK (REQUEST_INSTALL_PACKAGES)

#### 7. Error Handling
- [ ] Network errors show user-friendly messages
- [ ] Permission denials show actionable guidance
- [ ] App doesn't crash on errors
- [ ] Error boundary catches React errors

#### 8. Performance
- [ ] App remains responsive during transfers
- [ ] Screen stays awake during transfers (WAKE_LOCK)
- [ ] Memory usage stays reasonable
- [ ] No memory leaks during long transfers

## Device Compatibility

### Minimum Requirements
- Android 5.0 (API 21) or higher
- WiFi capability
- 50MB free storage

### Hotspot Requirements
- Android 8.0 (API 26) or higher for LocalOnlyHotspot
- Location permission (Android ≤12)
- Nearby Devices permission (Android 13+)

### Known Limitations
- Hotspot may not work on some carrier-locked devices
- Some OEMs block hotspot APIs
- Scoped storage restrictions on Android 10+

## Release Checklist

Before releasing to production:

- [ ] All tests pass
- [ ] Permissions are minimal and justified
- [ ] Native modules build correctly
- [ ] Error messages are user-friendly
- [ ] No console errors in production build
- [ ] App signs correctly with release keystore
- [ ] Version code incremented in app.json
- [ ] Tested on multiple Android versions (5.0, 10, 12, 13, 14)
- [ ] Tested on multiple device manufacturers (Samsung, Google, Xiaomi, etc.)
- [ ] APK size is reasonable (<50MB)
- [ ] No unused dependencies

## Support & Troubleshooting

For build issues:
1. Check this document first
2. Review console errors carefully
3. Clean build: `npx expo prebuild --clean`
4. Clear metro cache: `npx expo start -c`
5. Clear Gradle cache: `cd android && ./gradlew clean`

For runtime issues:
1. Check logcat: `adb logcat | grep FlashSend`
2. Verify permissions in device Settings
3. Test on different device/Android version
4. Check network connectivity

## Additional Resources

- Expo Documentation: https://docs.expo.dev
- React Native: https://reactnative.dev
- Android Permissions: https://developer.android.com/guide/topics/permissions
- LocalOnlyHotspot: https://developer.android.com/reference/android/net/wifi/WifiManager.LocalOnlyHotspotCallback
