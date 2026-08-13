# Build Prompt: Expo WiFi File-Sharing App

Paste this whole document to your AI coding agent. It's written as a spec/instruction set, phase by phase. Do not let the agent skip Phase 0 — it locks in architecture decisions that everything else depends on.

---

## PHASE 0 — Architecture decisions (read first, do not skip)

You are building a cross-platform (Android + iOS) file-sharing app with Expo. Before writing any code, lock in these decisions:

1. **This cannot be built in Expo Go.** It needs native modules (local networking, media library, sharing). Use an **Expo Dev Client** (`npx expo install expo-dev-client`, then `eas build --profile development`) and EAS Build for all testing from day one. Do not attempt this in Expo Go and then "fix it later" — set up the dev client first.

2. **Transport model: shared WiFi network, not raw WiFi Direct.**
   - True WiFi Direct (`react-native-wifi-p2p`) is Android-only and cannot interoperate with iOS. If the goal is Android-only, swap this in later as an enhancement — but build the core app on the model below first, since it works everywhere.
   - Model: both devices join the same WiFi network (existing router, or one phone's manually-enabled Personal/Mobile Hotspot — the app cannot turn this on for the user, only detect and prompt them to enable it in system settings).
   - Once on the same network: one device acts as **host** (runs a local HTTP server), the other as **client** (connects to it). Every device must be able to run BOTH roles at once so either side can push files at any time — see Phase 6.

3. **Pairing method: QR code, with mDNS auto-discovery as a stretch goal.**
   - QR code (host displays its local IP + port + a random session token; other device scans it with the camera) is reliable on every device and every Android skin. Build this first.
   - `react-native-zeroconf` (mDNS/Bonjour) can be added after for "nearby devices" auto-discovery, but it's flaky on some Android OEM skins (Xiaomi/Samsung power-saving killing background discovery) — treat it as a nice-to-have, not the primary path, and always keep QR as the fallback.

4. **Security: never leave the HTTP server open with no auth.** Anyone on the same WiFi network (a café hotspot, a shared home network) could otherwise hit the file server. Every request must include the session token generated at pairing time. Reject requests without it.

5. Confirm before building: **is this Android + iOS, or Android-only?** Everything below assumes Android + iOS. If Samuel wants Android-only, tell him WiFi Direct (`react-native-wifi-p2p`) becomes viable as the primary transport instead of the HTTP-over-shared-network model, and skip QR pairing in favor of native peer discovery.

---

## PHASE 1 — Project setup

1. `npx create-expo-app` (latest SDK), TypeScript template.
2. Install and configure `expo-dev-client` immediately — every subsequent native module requires rebuilding the dev client, so get the EAS Build pipeline (`eas build --profile development --platform android` and `--platform ios`) working before writing feature code.
3. Core packages to install now (all will be used below):
   - `expo-file-system` (downloads, resumable downloads, progress)
   - `expo-media-library` (photos/videos, permissions)
   - `expo-document-picker` (any file type, multi-select)
   - `expo-sharing`
   - `expo-camera` (QR scanning — use its built-in barcode scanning, not the deprecated `expo-barcode-scanner`)
   - `react-native-qrcode-svg` (QR generation)
   - `react-native-tcp-socket` + a minimal HTTP layer, OR `@dr.pogodin/react-native-static-server` (actively maintained; check its latest docs for exact API before using — don't assume the API from training data, verify against current README)
   - `react-native-zeroconf` (Phase 0 stretch goal — install now, wire up later)
   - `@react-navigation/native`, `@react-navigation/material-top-tabs` or `@react-navigation/drawer` (see Phase 3)
   - `expo-updates` (Phase 10)
   - `sp-react-native-in-app-updates` (wraps Play Core's In-App Update API — verify current package name/API against its latest docs, this ecosystem changes)
4. Set up `app.json`/`app.config.js` for the dev client, with placeholder Android package name and iOS bundle ID.

---

## PHASE 2 — Permissions (this is where mistakes happen — be exact)

### Android (`app.json` → `expo.android.permissions`, or native `AndroidManifest.xml` via config plugin)
Declare and runtime-request, grouped by feature:
- **Media access (Android 13+/API 33+):** `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO` — these replaced blanket storage permission. Below API 33, fall back to `READ_EXTERNAL_STORAGE`. `expo-media-library`'s permission request handles most of this, but confirm the config plugin declares all three media types, not just images.
- **Local network / WiFi:** `ACCESS_WIFI_STATE`, `CHANGE_WIFI_STATE`. On Android 13+, **`NEARBY_WIFI_DEVICES`** is required for WiFi scanning/discovery and does NOT require location permission if you declare `neverForLocation` in the manifest for that permission — do this, otherwise you'll trigger an unnecessary location permission prompt.
- **Legacy location requirement:** on Android versions before 13, WiFi scanning historically required `ACCESS_FINE_LOCATION` even though you're not using GPS. This is an OS quirk, not optional — the scan silently returns nothing without it on those versions. Handle both code paths (13+ uses NEARBY_WIFI_DEVICES, below uses ACCESS_FINE_LOCATION).
- **Bluetooth (Phase 9, app-sharing):** Android 12+ (API 31+) uses `BLUETOOTH_CONNECT` and `BLUETOOTH_SCAN` (both runtime-requested); below API 31 uses `BLUETOOTH` and `BLUETOOTH_ADMIN`.
- **Notifications (Android 13+):** `POST_NOTIFICATIONS`, runtime-requested — needed to show transfer progress in a notification while the app is backgrounded.
- **Installed apps (only if building the "Apps" tab, see Phase 4 note):** `QUERY_ALL_PACKAGES` — flag to Samuel that Google requires a declared-use justification for this on Play Store and scrutinizes it; do not add it unless the Apps tab is confirmed as in-scope.

### iOS (`Info.plist` via `app.json` → `expo.ios.infoPlist`)
- `NSPhotoLibraryUsageDescription` — required for `expo-media-library`.
- `NSCameraUsageDescription` — required for QR scanning.
- **`NSLocalNetworkUsageDescription`** — required since iOS 14 for any local-network HTTP/socket connections (this is the one agents most often forget; without it, every local network request silently fails and the app looks broken).
- **`NSBonjourServices`** — required alongside local network usage if using mDNS/Zeroconf discovery; must list the specific service type string your app advertises (e.g. `_yourapp._tcp`).
- `NSBluetoothAlwaysUsageDescription` — only needed if Phase 9's Bluetooth share is attempted on iOS (see Phase 9 note — likely Android-only anyway).

### Request flow
- Request permissions contextually (when the user first opens a tab that needs them — Photos tab requests media permission, not all on app launch), not one giant blast on first open. But DO show a single onboarding screen up front explaining *why* each permission will be asked, before the OS dialogs start firing — this reduces deny rates significantly.
- Handle the "denied, don't ask again" state explicitly: detect it and show a button linking to app settings (`Linking.openSettings()`), don't just silently fail.

---

## PHASE 3 — Navigation shell (sliding navigation)

- Use `@react-navigation/material-top-tabs` for swipeable, sliding horizontal navigation between screens — this matches "sliding nav" with an ordered screen list better than a drawer (side-menu) does. Confirm this interpretation with Samuel if unsure; if he actually means a hamburger-menu slide-out, swap to `@react-navigation/drawer` — the screen list and logic below don't change either way.
- Screen order (left to right / default first): **Apps → Photos → Videos → Audio → Files**.
- "Apps" default screen: before building this, confirm with Samuel whether it means (a) send installed APKs to other devices (needs `QUERY_ALL_PACKAGES`, Play Store risk — see Phase 2), or (b) something else like recently-shared items. Don't build (a) silently without his sign-off given the policy risk.
- "Files" (last tab) = general phone storage, any file type not covered by the media-specific tabs — use `expo-document-picker` with `type: '*/*'` and `multiple: true`.

---

## PHASE 4 — File browsing + multi-select (each tab)

For Photos/Videos/Audio tabs:
- Use `expo-media-library` (`MediaLibrary.getAssetsAsync` filtered by `mediaType`) to list items in a grid (photos/videos) or list (audio).
- Multi-select: long-press an item to enter selection mode; tapping toggles selection with a checkmark overlay; show a persistent header with selected count and a "Select all" / "Clear" action; selection state must survive scrolling (don't rely on visible-item state).
- Paginate/virtualize the list (`FlatList` with `windowSize`/`getItemLayout` tuned, or `FlashList`) — media libraries can have thousands of items; don't load them all into memory at once.

For Files tab:
- `expo-document-picker` with `multiple: true` for one-shot multi-select via the OS file picker (this is simpler and more reliable than building a custom file browser — recommend this over a custom Storage Access Framework browser unless Samuel specifically wants in-app browsing of the file system).

---

## PHASE 5 — Floating action buttons

- Two FABs, positioned bottom-left ("Receive") and bottom-right ("Send"), visible on every tab, persisting the current tab's selection state underneath.
- **Send**: disabled/hidden if nothing is selected across any tab; tapping it generates the host session (Phase 6) and shows the QR code for the other device to scan.
- **Receive**: opens the camera to scan the sending device's QR code, then connects as a client.
- Both buttons must be reachable while a transfer is already active — tapping either while a transfer is running should navigate to the active Transfer screen (Phase 7) instead of starting a new session, to avoid two overlapping transfers confusing the state machine.

---

## PHASE 6 — Networking core (the actual file transfer engine)

This is the highest-risk part of the build. Be explicit with the agent about the state machine:

1. **Every device runs both a lightweight HTTP server and an HTTP client simultaneously** — this is what makes "both devices can send and receive once connected" work. Don't build a client-only/server-only split; every session, both peers hold both roles open.
2. **Session start (Send flow):**
   - Device A picks files → generates a random session token → starts local HTTP server → encodes `{localIP, port, token}` into a QR code → displays it.
   - Device B (Receive flow) scans the QR → extracts `{localIP, port, token}` → calls `GET /manifest` on Device A with the token, which returns file names, sizes, and mime types for the selected files.
   - Device B requests each file via `GET /file/:id` with the token in headers; use `expo-file-system`'s `createDownloadResumable` so downloads survive interruption and expose progress callbacks.
3. **Reverse direction (both-can-send):** once paired, the token/IP pair is known to both sides — Device B can equally start pushing files to Device A's server using the same manifest/file endpoints, just reversed. Don't require re-pairing to switch direction.
4. **Progress reporting:** each active transfer (per file) needs bytes-transferred / total-bytes, updated at least every ~250ms, surfaced via a shared state store (e.g. Zustand or React Context) that the Transfer screen (Phase 7) subscribes to.
5. **Multi-file handling:** transfer files sequentially or with a small concurrency cap (2-3 parallel) — don't fire all selected files at once on constrained mobile hardware/networks.
6. **Integrity:** send a checksum (e.g. file size + a fast hash) in the manifest and verify after download; surface a retry option per-file on mismatch, don't just silently accept a corrupt file.
7. **Failure handling:** WiFi drops, app backgrounding, and the other device sleeping are the three failure modes that will actually happen in testing. Each in-progress file transfer must be resumable from where it left off, not restarted from zero, using `expo-file-system`'s resumable download support.

---

## PHASE 7 — Active transfer screen

- Shown automatically whenever a transfer session is active (navigate here on session start, and re-enter it if the user backgrounds and reopens the app mid-transfer).
- List every file in the current session (incoming AND outgoing together, since both directions can be active), each row showing: filename, direction (in/out), a progress bar, percentage, transfer speed, and a per-file cancel button.
- A session-level summary at the top: total files, total size, overall progress, and a "Done" state once everything completes or fails.
- Keep a background notification (Android) mirroring overall progress so the user isn't forced to keep the app foregrounded — but note that Android will still throttle background networking after a while, so warn the user in-UI to keep the app open for large transfers, don't promise seamless background transfer.

---

## PHASE 8 — Permissions request orchestration

- On first launch: one short onboarding screen explaining the app needs media, local network, and (if applicable) Bluetooth access, and why — then let each tab/action trigger its own specific permission request the first time it's actually needed (see Phase 2's "Request flow" note — don't duplicate that logic elsewhere).

---

## PHASE 9 — Share the app itself via Bluetooth

Clarify scope first: this realistically means **Android only**. iOS does not allow app-to-app sharing of installable app packages between devices at all — there is no IPA-sharing equivalent, so skip this feature entirely on iOS and don't attempt it.

Recommended approach (reliable) over raw Bluetooth OBEX (fragile, poorly supported in RN):
1. Add a small native module (or a config plugin invoking one) to retrieve the running app's own APK path via Android's `PackageManager` (`context.getPackageCodePath()`).
2. Trigger Android's native **share sheet** with that APK file attached, using `expo-sharing`'s `shareAsync` (or a native `Intent.ACTION_SEND` if `expo-sharing` doesn't expose the needed MIME/file flags) — the user picks Bluetooth as the destination from the standard OS share sheet, same as sharing any other file. This avoids building a custom Bluetooth file-transfer protocol entirely.
3. Note for Samuel: the receiving user must have "install from unknown sources" enabled for your app's installer source, and will see Android's standard "install this app?" prompt — there's no way around that prompt, it's an OS security gate, not something the app controls.

---

## PHASE 10 — Auto-update (be precise about what "no prompt" can actually mean)

Two separate mechanisms, don't conflate them:

1. **JS/asset-only changes (bug fixes, UI tweaks, logic changes that don't touch native code or permissions):** use `expo-updates`. Configure it to check for and download updates silently on app start/foreground, and apply them on the *next* app launch — this can be fully silent, no user prompt, exactly matching what Samuel asked for, but only covers JS-level changes.
2. **Native code changes, new permissions, or new native dependencies:** these require a real Play Store binary update, which cannot be silent — Google Play itself will only auto-install updates in the background if the user has the device-level "auto-update apps" setting on (which the app cannot force or check), and even then, any update adding a new dangerous permission still forces an explicit user-facing prompt at update time. Use `sp-react-native-in-app-updates` (Play Core In-App Update wrapper — verify current API against its latest docs) to at least prompt the "flexible" background-download flow rather than blocking the user, but tell Samuel plainly: a fully silent, unprompted binary update is not something Google Play permits, full stop.
3. Build the release pipeline so routine fixes ship via `expo-updates` (truly silent) and only ship a Play Store binary release when native changes force it — this gets Samuel the "no prompt" behavior for the vast majority of his actual updates.

---

## PHASE 11 — Testing checklist (give this to the agent explicitly, don't let it skip)

- Test on at least two real physical devices (simulators/emulators generally can't do real WiFi P2P networking reliably) — one Android, one iOS if cross-platform is in scope.
- Test with both devices on: (a) the same home WiFi router, (b) one phone's mobile hotspot with the other joining it.
- Test large files (a multi-GB video) for memory behavior — never load a full file into JS memory; stream it via `expo-file-system`'s file-based APIs.
- Test app backgrounding mid-transfer on both platforms.
- Test permission-denied and "don't ask again" paths for every permission in Phase 2.
- Test what happens when both devices try to initiate "Send" at the same time.
- Test on at least one Samsung and one Xiaomi/other aggressive-battery-optimization device if targeting Android broadly — these OEMs kill background networking more aggressively than stock Android and will surface bugs stock testing won't catch.

---

*Assumptions baked into this doc: cross-platform Android+iOS, shared-WiFi-network transport (not raw WiFi Direct), QR-code pairing as primary discovery method, sliding nav = swipeable top tabs. Flip any of these explicitly with the agent before it starts if you want different tradeoffs.*