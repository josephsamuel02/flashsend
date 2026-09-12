// src/screens/ScanScreen.tsx
// Android receiver: scan QR, auto-join hotspot, fetch manifest, go to Transfer

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Linking,
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import WifiManager from 'react-native-wifi-reborn';

import { useTransferStore } from '../store/transferStore';
import { fetchManifestWithFallbacks } from '../networking/client';
import { startServer, generateToken, DEFAULT_PORT } from '../networking/server';
import { getLocalIPAddress } from '../networking/networkInfo';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius } from '../theme/colors';

async function requestWifiPermissions(): Promise<{ ok: boolean; missing?: string }> {
  if (Platform.OS !== 'android') return { ok: true };
  try {
    const api = Platform.Version as number;
    // NOTE: react-native-wifi-reborn's native code requires ACCESS_FINE_LOCATION
    // (+ Location services ON) on ALL Android versions — NEARBY_WIFI_DEVICES
    // alone is NOT enough, even on API 33+. Request both on 33+.
    const perms: string[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    if (api >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES as string);
    }
    const res = await PermissionsAndroid.requestMultiple(perms as any);
    const resMap = res as unknown as Record<string, string>;
    const denied = perms.filter((p) => resMap[p] !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied.length === 0) return { ok: true };
    return { ok: false, missing: denied.join(', ') };
  } catch (e) {
    return { ok: false, missing: 'permission request failed' };
  }
}

function parseQRPayload(raw: string): { ip: string; port: number; token: string; ssid?: string; password?: string } {
  const payload = JSON.parse(raw.trim());
  if (!payload.ip || !payload.port || !payload.token || payload.v !== 1) {
    throw new Error('Invalid QR — not a Flash Send session. Re-scan the sender QR.');
  }
  return payload;
}

export default function ScanScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [wifiStatus, setWifiStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualIP, setManualIP] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Refs guard against expo-camera firing onBarcodeScanned many times per
  // second for the same QR. State-based guards are stale inside the callback
  // closure, so a ref (+ timestamp debounce) is the only reliable lock.
  const busyRef = useRef(false);
  const lastScanAtRef = useRef(0);
  const connectedRef = useRef(false);
  const lastPayloadRef = useRef<{ ip: string; port: number; token: string; ssid?: string; password?: string } | null>(null);

  const { setSession, setSessionState, replaceFiles } = useTransferStore();

  // If the user backs out after we bound the process to the hotspot network,
  // unbind so normal internet works again. After a successful connect we set
  // connectedRef and TransferScreen owns the binding instead.
  useEffect(() => {
    return () => {
      if (!connectedRef.current && Platform.OS === 'android') {
        try {
          (WifiManager as any).forceWifiUsageWithOptions?.(false, { noInternet: false });
        } catch {}
      }
    };
  }, []);

  const bindToWifi = async () => {
    try {
      await (WifiManager as any).forceWifiUsageWithOptions?.(true, { noInternet: true });
    } catch (e) {
      console.warn('[Scan] forceWifiUsage failed (non-fatal):', (e as any)?.message);
    }
  };

  // Best-effort check only — on Android 10+ the per-app WifiNetworkSpecifier
  // connection does NOT change the system SSID, so getCurrentWifiSSID will
  // usually still show the old network. Never gate the flow on this.
  const bestEffortSSIDCheck = async (targetSSID: string, timeoutMs = 3000): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const status = await (WifiManager as any).connectionStatus?.();
        if (status === true) return true;
      } catch {}
      try {
        const current: any = await (WifiManager as any).getCurrentWifiSSID?.();
        const normalized = typeof current === 'string' ? current.replace(/^"|"$/g, '') : '';
        if (normalized && normalized === targetSSID) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  const completeConnection = useCallback(async (payload: any, manifest: any, workingIP: string) => {
    const myToken = generateToken();
    const myIP = await getLocalIPAddress();
    // Start receiver's own server (so sender can also pull if needed)
    try {
      await startServer(myToken, [], () => undefined);
    } catch (e) {
      console.warn('[Scan] startServer receiver failed', e);
    }

    replaceFiles(
      manifest.files.map((f: any) => ({
        id: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        direction: 'incoming' as const,
        checksum: f.checksum,
      }))
    );

    setSession({
      token: payload.token,
      localIP: myIP,
      port: DEFAULT_PORT,
      peerIP: workingIP,
      peerPort: payload.port,
    });
    setSessionState('connected');
    connectedRef.current = true;

    navigation.replace('Transfer', {
      peer: { ip: workingIP, port: payload.port, token: payload.token },
      files: manifest.files,
    });
  }, [navigation, replaceFiles, setSession, setSessionState]);

  const connectWithPayload = useCallback(async (payload: { ip: string; port: number; token: string; ssid?: string; password?: string }) => {
    console.log(`[Scan] QR ok: ssid=${payload.ssid || '(none)'} ip=${payload.ip} port=${payload.port}`);
    const hasHotspotCreds = !!payload.ssid && !!payload.password;
    // Sender created a hotspot but password didn't survive (shouldn't happen
    // for WPA2 LOHS) — tell the user to join manually instead of failing cryptically.
    if (payload.ssid && !payload.password) {
      console.warn('[Scan] QR has SSID but empty password');
      setWifiStatus(`Join ${payload.ssid} manually…`);
      await bindToWifi();
      setWifiStatus('Fetching files… (join hotspot first)');
      const { manifest, workingIP } = await fetchManifestWithFallbacks(
        { ip: payload.ip, port: payload.port, token: payload.token },
        5000,
        (ip, idx, total) => setWifiStatus(`Trying ${ip}… (${idx}/${total}) — join ${payload.ssid} in WiFi settings if this fails`)
      );
      await completeConnection(payload, manifest, workingIP);
      return;
    }

    if (hasHotspotCreds) {
      const perm = await requestWifiPermissions();
      if (!perm.ok) {
        throw new Error(
          `WiFi permission denied (${perm.missing}). Grant Location (and Nearby devices on Android 13+) in Settings → Apps → Flash Send → Permissions, and turn Location services ON.`
        );
      }

      setWifiStatus(`Joining ${payload.ssid}…`);
      try {
        await (WifiManager as any).connectToProtectedWifiSSID({
          ssid: payload.ssid,
          password: payload.password,
          isWEP: false,
          isHidden: false,
          timeout: 18,
        });
        console.log('[Scan] wifi join resolved');
      } catch (e: any) {
        // Non-fatal: on Android 10+ this can reject with
        // didNotFindNetwork/timeout even when the per-app binding worked,
        // or with locationPermissionMissing/locationServicesOff when the
        // real problem is permissions. Surface permission errors, but
        // continue to manifest fetch for connectivity errors.
        const msg = String(e?.message || e || '');
        console.warn('[Scan] connect threw:', e?.code || msg);
        if (/locationPermissionMissing|locationServicesOff|location/i.test(String(e?.code || '') + ' ' + msg)) {
          throw new Error('Location permission/services required to join WiFi. Turn Location ON and grant Location permission, then retry.');
        }
      }

      // Best-effort only — do NOT fail if SSID doesn't match (see helper).
      setWifiStatus('Checking connection…');
      await bestEffortSSIDCheck(payload.ssid!, 3000);

      // Critical: LocalOnlyHotspot has no internet, so Android would route
      // our HTTP fetch over mobile data unless we bind to WiFi first.
      setWifiStatus('Binding to sender WiFi…');
      await bindToWifi();
      await new Promise((r) => setTimeout(r, 800));
    } else {
      setWifiStatus('Connecting…');
      await bindToWifi();
    }

    setWifiStatus('Fetching files…');
    const { manifest, workingIP } = await fetchManifestWithFallbacks(
      { ip: payload.ip, port: payload.port, token: payload.token },
      5000,
      (ip, idx, total) => setWifiStatus(`Trying ${ip}… (${idx}/${total})`)
    );
    await completeConnection(payload, manifest, workingIP);
  }, [completeConnection]);

  const resetScanner = useCallback(() => {
    busyRef.current = false;
    lastScanAtRef.current = 0;
    setScanned(false);
    setConnecting(false);
    setWifiStatus(null);
    setError(null);
  }, []);

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    const now = Date.now();
    if (busyRef.current || now - lastScanAtRef.current < 2000) return;
    busyRef.current = true;
    lastScanAtRef.current = now;
    setScanned(true);
    setConnecting(true);
    setError(null);
    setWifiStatus(null);

    try {
      let payload: any;
      try {
        payload = parseQRPayload(data);
      } catch {
        throw new Error('Invalid QR code. Make sure it is a Flash Send QR.');
      }
      lastPayloadRef.current = payload;
      await connectWithPayload(payload);
      // on success we navigated away; keep busy until unmount
    } catch (err: any) {
      const msg = err?.message || 'Failed to connect';
      console.error('[Scan] error', msg);
      setError(msg);
      setConnecting(false);
      // Release the lock so the user can scan again (button or auto after delay)
      busyRef.current = false;
      // Keep `scanned` true so the camera doesn't instantly re-fire the same
      // QR in a loop — user taps "Scan Again".
      setShowManual(true);
    }
  }, [connectWithPayload]);

  const handleManualConnect = useCallback(async () => {
    const ip = manualIP.trim();
    if (!ip) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setConnecting(true);
    setError(null);
    try {
      const prev = lastPayloadRef.current;
      if (!prev?.token || !prev?.port) {
        throw new Error('Scan the QR first — manual IP still needs the session token from the sender QR.');
      }
      setWifiStatus(`Trying ${ip}…`);
      await bindToWifi();
      setWifiStatus('Fetching files…');
      const { manifest, workingIP } = await fetchManifestWithFallbacks(
        { ip, port: prev.port, token: prev.token },
        5000,
        (tryIP, idx, total) => setWifiStatus(`Trying ${tryIP}… (${idx}/${total})`)
      );
      await completeConnection(prev, manifest, workingIP);
    } catch (err: any) {
      setError(err?.message || 'Manual connect failed');
      setConnecting(false);
      busyRef.current = false;
    }
  }, [manualIP, completeConnection]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <View style={styles.permIcon}>
          <MaterialIcons name="camera-alt" size={36} color="white" />
        </View>
        <Text style={styles.permTitle}>Camera Permission</Text>
        <Text style={styles.permSub}>Required to scan QR codes</Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <MaterialIcons name="camera-alt" size={18} color="white" />
          <Text style={styles.grantButtonText}>Grant</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsLink}>
          <Text style={styles.settingsLinkText}>Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        <View style={styles.overlay}>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            {!scanned && <View style={styles.scanLine} />}
          </View>
          <Text style={styles.viewfinderLabel}>Align QR code</Text>
        </View>
      </CameraView>

      <View style={styles.statusBar}>
        {connecting ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={C.primary} size="small" />
            <Text style={styles.statusText}>{wifiStatus || 'Connecting...'}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={20} color={C.error} />
            <Text style={styles.errorText}>{error.split('\n')[0]}</Text>
            <Text style={styles.errorHint}>Tip: turn off mobile data, keep Location ON, stay close to sender.</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity onPress={resetScanner} style={styles.retryBtn}>
                <MaterialIcons name="qr-code-scanner" size={18} color="white" />
                <Text style={styles.retryText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  try {
                    (WifiManager as any).openWifiSettings?.();
                  } catch {
                    Linking.openSettings();
                  }
                }}
                style={styles.settingsBtn}
              >
                <Text style={styles.settingsBtnText}>WiFi</Text>
              </TouchableOpacity>
            </View>
            {showManual && (
              <View style={styles.manualRow}>
                <TextInput
                  value={manualIP}
                  onChangeText={setManualIP}
                  placeholder="Sender IP (e.g. 192.168.43.1)"
                  placeholderTextColor="#888"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="numeric"
                  style={styles.manualInput}
                />
                <TouchableOpacity onPress={handleManualConnect} style={styles.manualBtn}>
                  <Text style={styles.retryText}>Join</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Point camera at QR code</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: C.background },
  permIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: FontSize.xl, fontWeight: '700', color: C.textPrimary, textAlign: 'center' },
  permSub: { fontSize: FontSize.md, color: C.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  grantButton: { flexDirection: 'row', gap: 8, backgroundColor: C.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: BorderRadius.round, alignItems: 'center', marginTop: 8 },
  grantButtonText: { color: 'white', fontWeight: '700', fontSize: FontSize.md },
  settingsLink: { padding: 8 },
  settingsLinkText: { color: C.primary, fontWeight: '600', fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'android' ? 48 : 50,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: { padding: Spacing.sm, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20 },
  headerTitle: { flex: 1, textAlign: 'center', color: 'white', fontWeight: '700', fontSize: FontSize.xl, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 16 },
  viewfinder: {
    width: 250,
    height: 250,
    position: 'relative',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewfinderLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600', marginTop: 12, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  scanLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: C.primary,
    opacity: 0.9,
    top: '50%',
    shadowColor: C.primary,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: C.primary },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 12 },
  statusBar: { backgroundColor: C.background, padding: Spacing.md, minHeight: 72, justifyContent: 'center', borderTopWidth: 1, borderTopColor: C.surfaceBorder },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.success },
  statusText: { color: C.textSecondary, fontSize: FontSize.sm, flex: 1, fontWeight: '600' },
  errorBox: { gap: Spacing.sm },
  errorText: { color: C.error, fontSize: FontSize.sm, flex: 1 },
  errorHint: { color: C.textMuted, fontSize: 12 },
  errorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  retryBtn: { flexDirection: 'row', gap: 6, backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, alignItems: 'center' },
  retryText: { color: 'white', fontWeight: '700', fontSize: 13 },
  settingsBtn: { backgroundColor: C.surfaceElevated, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, borderWidth: 1, borderColor: C.surfaceBorder, justifyContent: 'center' },
  settingsBtnText: { color: C.textSecondary, fontWeight: '600', fontSize: 13 },
  manualRow: { flexDirection: 'row', gap: 8, marginTop: 8, alignItems: 'center' },
  manualInput: { flex: 1, backgroundColor: C.surfaceElevated, borderWidth: 1, borderColor: C.surfaceBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.textPrimary, fontSize: 14 },
  manualBtn: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
