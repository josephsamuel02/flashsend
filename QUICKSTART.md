# Flash Send - Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Prerequisites Check
```bash
# Check Node version (need 18+ or 20+)
node --version

# Check Java version (need 17)
java --version

# Check Android SDK
echo $ANDROID_HOME
```

If any are missing, see [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md) for installation instructions.

### Step 1: Clone & Install (2 minutes)
```bash
# Clone the repo
git clone <your-repo-url>
cd SendApp

# Install dependencies
npm install
```

### Step 2: Build (2 minutes)
```bash
# Generate native Android code
npx expo prebuild --clean

# This creates the android/ directory and links native modules
```

### Step 3: Run (1 minute)
```bash
# Connect Android device or start emulator, then:
npx expo run:android
```

That's it! The app should launch on your device. 🎉

## 🧪 Quick Test

### Test Hotspot Creation (Sender)
1. Open app
2. Tap any file to select
3. Tap **Send** button (bottom right)
4. Grant Location/Nearby Devices permission if asked
5. Wait for hotspot creation
6. QR code should appear

### Test QR Scanning (Receiver)
1. Open app on second device
2. Tap **Receive** button (bottom left)
3. Grant Camera permission
4. Scan sender's QR code
5. Auto-join hotspot (wait 5-10 seconds)
6. Files should start downloading

## ⚡ Development Tips

### Fast Refresh
```bash
# Start Metro bundler for fast refresh
npm start

# In separate terminal, run app
npx expo run:android
```

### View Logs
```bash
# React Native logs
npx expo start

# Android native logs
adb logcat | grep FlashSend
```

### Clean Build (if issues)
```bash
# Clean everything and rebuild
npx expo prebuild --clean
cd android && ./gradlew clean && cd ..
npx expo run:android
```

### Debug Permissions
```bash
# Check app permissions on device
adb shell dumpsys package com.flashsend.app | grep permission
```

## 🐛 Common First-Time Issues

### Issue: "Module not found"
**Fix:** Run `npx expo prebuild --clean` - native modules need linking

### Issue: "Port 42124 in use"
**Fix:** Force stop app: Settings → Apps → Flash Send → Force Stop

### Issue: "No apps in Apps tab"
**Fix:** Grant "Query All Packages" in app permissions, then restart app

### Issue: "Hotspot failed"
**Fix:** 
- Enable Location Services (Android ≤12)
- Grant Nearby Devices permission (Android 13+)
- Disable any active hotspot/tethering first

## 📱 Testing Devices

**Minimum:** Android 5.0 device or emulator  
**Recommended:** Real device with Android 8.0+ for hotspot testing  
**Best:** Two real devices (one sender, one receiver)

## 📚 Next Steps

- Read [README.md](README.md) for detailed features
- Read [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md) for comprehensive guide
- Read [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for architecture details

## 💡 Pro Tips

1. **Use Real Devices** - Hotspot doesn't work on emulators
2. **Test Permissions Early** - Some need device restart
3. **Check Logs Often** - All errors are logged with [Network] or [Host] prefix
4. **Test on Multiple Androids** - Behavior varies by version
5. **Clear App Data** - Settings → Apps → Flash Send → Clear Data (for clean state)

## 🆘 Get Help

**Build Issues?** → [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md)  
**Code Questions?** → Check inline comments in source files  
**Errors?** → Check [errorHandler.ts](src/utils/errorHandler.ts)

## ✅ Success Checklist

- [ ] App builds without errors
- [ ] App launches on device
- [ ] Permissions are requested appropriately
- [ ] Apps tab shows installed apps
- [ ] Photos tab shows gallery images
- [ ] Send button works (creates hotspot)
- [ ] Receive button works (opens camera)
- [ ] QR scanning works
- [ ] File transfer completes successfully

If all checked ✅ - You're ready to develop!

---

**Happy Coding! 🎉**
