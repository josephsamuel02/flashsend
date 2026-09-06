# Flash Send - Fast File Sharing for Android

<p align="center">
  <img src="assets/flash-send-icon.png" alt="Flash Send Logo" width="120"/>
</p>

**Flash Send** is a high-speed, offline file-sharing app for Android devices, inspired by Xender. Share photos, videos, apps, music, and documents between devices without internet — using WiFi Direct hotspot technology.

## ✨ Features

### 🚀 **Lightning Fast Transfers**
- **Direct device-to-device** connection via WiFi hotspot
- **No internet required** - works completely offline
- **Multi-file parallel transfers** - send multiple files simultaneously
- **Resume support** - continue interrupted transfers

### 📱 **Share Everything**
- **Apps (APKs)** - Share installed apps with friends
- **Photos & Videos** - Transfer media from gallery
- **Music & Audio** - Share your favorite songs
- **Documents** - PDFs, office files, archives
- **Any files** - Browse and share any file on device

### 🔒 **Secure & Private**
- **Local network only** - files never leave your devices
- **Session tokens** - secure connection authentication
- **No data collection** - complete privacy
- **No accounts required** - instant setup

### 💡 **Easy to Use**
- **QR code pairing** - scan to connect instantly
- **Auto-join hotspot** - receiver auto-connects (Android 8+)
- **Material Design UI** - beautiful, intuitive interface
- **Real-time progress** - see speed, ETA, and file status

## 📸 Screenshots

<!-- Add your app screenshots here -->

## 🛠️ Technology Stack

### Frontend
- **React Native** - Cross-platform framework
- **Expo** - Development and build tooling
- **TypeScript** - Type-safe code
- **Zustand** - State management
- **React Navigation** - Screen navigation

### Native Modules
- **flash-send-hotspot** - LocalOnlyHotspot management
- **sendapp-native** - App listing, file operations, APK handling

### Networking
- **react-native-tcp-socket** - TCP server for file transfers
- **expo-file-system** - File operations
- **react-native-wifi-reborn** - WiFi management
- **expo-network** - Network state detection

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ or 20+
- **Java JDK** 17
- **Android SDK** (API 34)
- **Android Studio** (latest)
- **Expo CLI** (`npm install -g expo-cli`)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/flash-send.git
   cd flash-send
   ```

2. **Install dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Prebuild native projects**
   ```bash
   npx expo prebuild --clean
   ```

4. **Run on Android**
   ```bash
   npx expo run:android
   ```

### Development

Start Metro bundler:
```bash
npm start
```

Build for development:
```bash
npx expo run:android
```

Build for release:
```bash
cd android
./gradlew assembleRelease
```

## 📋 Permissions

Flash Send requires these permissions:

### Media Access (Android 13+)
- `READ_MEDIA_IMAGES` - Access photos
- `READ_MEDIA_VIDEO` - Access videos
- `READ_MEDIA_AUDIO` - Access music

### Storage (Android 12 and below)
- `READ_EXTERNAL_STORAGE` - Read files

### WiFi & Networking
- `ACCESS_WIFI_STATE` - Check WiFi status
- `CHANGE_WIFI_STATE` - Control WiFi
- `NEARBY_WIFI_DEVICES` - WiFi operations (Android 13+)
- `ACCESS_FINE_LOCATION` - WiFi operations (Android 12 and below)
- `INTERNET` - Local network communication

### Other
- `CAMERA` - Scan QR codes
- `WAKE_LOCK` - Keep screen awake during transfers
- `REQUEST_INSTALL_PACKAGES` - Install received APKs
- `QUERY_ALL_PACKAGES` - List installed apps

All permissions are requested at runtime when needed, with clear explanations.

## 🎯 How It Works

### Sender (Host)
1. Select files from any tab (Apps, Photos, Videos, Audio, Files)
2. Tap **Send** button
3. App creates a **LocalOnlyHotspot** (WiFi hotspot)
4. QR code displays with connection info
5. HTTP server starts on port 42124
6. Files are served to receiver on demand

### Receiver (Client)
1. Tap **Receive** button
2. Scan sender's QR code with camera
3. Auto-joins sender's hotspot (Android 8+)
4. Fetches file list (manifest)
5. Downloads files in parallel
6. Saves to categorized folders (Images, Videos, Apps, Documents, Audio, Files)
7. Media files automatically appear in gallery

### Network Architecture
```
Sender Device                    Receiver Device
│                                │
├─ Creates LocalOnlyHotspot      │
│  (192.168.43.1)                │
│                                │
├─ Starts HTTP Server            │
│  (Port 42124)                  │
│                                │
├─ Generates QR Code             ├─ Scans QR Code
│  (SSID, Password, IP, Token)   │
│                                │
│                                ├─ Joins Hotspot
│                                │  (Auto-connect)
│                                │
│                                ├─ Fetches Manifest
│  <─────────────────────────────┤  GET /manifest
│                                │
├─ Serves Files                  ├─ Downloads Files
│  GET /file/:id                 │  (Parallel, Resumable)
│  ──────────────────────────────>
```

## 📁 Project Structure

```
SendApp/
├── App.tsx                      # Root component with error boundary
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── tsconfig.json                # TypeScript config
│
├── assets/                      # App icons and images
│   ├── flash-send-icon.png
│   ├── android-icon-foreground.png
│   └── android-icon-monochrome.png
│
├── src/
│   ├── components/              # Reusable UI components
│   │   ├── ErrorBoundary.tsx    # Error handling
│   │   ├── LoadingOverlay.tsx   # Loading states
│   │   └── FloatingActionButtons.tsx
│   │
│   ├── screens/                 # App screens
│   │   ├── OnboardingScreen.tsx
│   │   ├── HostScreen.tsx       # Sender/server screen
│   │   ├── ScanScreen.tsx       # QR scanner screen
│   │   ├── TransferScreen.tsx   # Transfer progress
│   │   └── tabs/                # Content tabs
│   │       ├── AppsTab.tsx
│   │       ├── PhotosTab.tsx
│   │       ├── VideosTab.tsx
│   │       ├── AudioTab.tsx
│   │       └── FilesTab.tsx
│   │
│   ├── navigation/              # Navigation setup
│   │   └── MainNavigator.tsx
│   │
│   ├── networking/              # Network layer
│   │   ├── server.ts            # HTTP file server (TCP)
│   │   ├── client.ts            # HTTP client with resume
│   │   └── networkInfo.ts       # IP detection, probing
│   │
│   ├── store/                   # State management (Zustand)
│   │   ├── selectionStore.ts    # File selection state
│   │   └── transferStore.ts     # Transfer state & progress
│   │
│   ├── theme/                   # Design system
│   │   └── colors.ts            # Colors, spacing, fonts
│   │
│   └── utils/                   # Utilities
│       └── errorHandler.ts      # Error formatting
│
├── modules/                     # Native modules
│   ├── flash-send-hotspot/      # Hotspot management
│   │   ├── android/
│   │   │   └── src/main/java/expo/modules/flashsendhotspot/
│   │   │       └── FlashSendHotspotModule.kt
│   │   ├── index.ts
│   │   └── expo-module.config.json
│   │
│   └── sendapp-native/          # App listing & file ops
│       ├── android/
│       │   └── src/main/java/expo/modules/sendappnative/
│       │       └── SendappNativeModule.kt
│       ├── index.ts
│       └── expo-module.config.json
│
├── plugins/                     # Expo config plugins
│   ├── withHotspotPermissions.js
│   └── withAppQueries.js
│
└── BUILD_VERIFICATION.md        # Build & testing guide
```

## 🧪 Testing

Run all tests:
```bash
npm test
```

Manual testing checklist available in [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md)

## 🐛 Troubleshooting

### Common Issues

**Hotspot creation fails**
- Enable Location Services (Android ≤12)
- Grant Nearby Devices permission (Android 13+)
- Disable existing hotspot/tethering
- Restart device

**No apps showing in Apps tab**
- Grant "Query All Packages" permission in Settings
- Rebuild app: `npx expo prebuild --clean`

**Port already in use**
- Force stop app: Settings → Apps → Flash Send → Force Stop
- Close other file sharing apps

**Connection timeout**
- Ensure both devices on same WiFi or receiver joined hotspot
- Move devices closer together
- Disable Mobile Data on receiver

Full troubleshooting guide: [BUILD_VERIFICATION.md](BUILD_VERIFICATION.md)

## 📱 Compatibility

- **Minimum:** Android 5.0 (API 21)
- **Hotspot:** Android 8.0 (API 26) or higher
- **Tested on:** Android 5.0 - 14.0
- **Devices:** Samsung, Google Pixel, Xiaomi, OnePlus, etc.

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by **Xender** and **SHAREit**
- Built with **Expo** and **React Native**
- Uses **LocalOnlyHotspot** API from Android
- Icons from **Material Icons**

## 📞 Contact

For questions or support:
- **Email:** your-email@example.com
- **Issues:** [GitHub Issues](https://github.com/yourusername/flash-send/issues)

## 🔗 Links

- [Expo Documentation](https://docs.expo.dev)
- [React Native Documentation](https://reactnative.dev)
- [Android Developer Guides](https://developer.android.com)

---

**Made with ❤️ for the Android community**
