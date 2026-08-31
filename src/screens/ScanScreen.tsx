// src/screens/ScanScreen.tsx
// Android receiver: scan QR, auto-join hotspot, fetch manifest, go to Transfer

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Alert,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import WifiManager from 'react-native-wifi-reborn';

import { useTransferStore } from '../store/transferStore';
import { fetchManifest } from '../networking/client';
import { startServer, generateToken, DEFAULT_PORT } from '../networking/server';
import { getLocalIPAddress } from '../networking/networkInfo';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';

async function requestWifiPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const api = Platform.Version as number;
    const perms: string[] = [];
    if (api >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES as string);
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    if (perms.length === 0) return true;
    const res = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(res).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export default function ScanScreen() {
  const navigation = useNavigation<any>();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [wifiStatus, setWifiStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setSession, setSessionState, replaceFiles } = useTransferStore();

  const pollForSSID = async (targetSSID: string, timeoutMs = 9000, intervalMs = 500): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const current: any = await (WifiManager as any).getCurrentWifiSSID?.();
        const normalized = typeof current === 'string' ? current.replace(/^"|"$/g, '') : '';
        if (normalized === targetSSID) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  };

  const completeConnection = async (payload: any, manifest: any) => {
    const myToken = generateToken();
    const myIP = await getLocalIPAddress();
    // Start receiver's own server (so sender could also pull if needed)
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
      peerIP: payload.ip,
      peerPort: payload.port,
    });
    setSessionState('connected');

    navigation.replace('Transfer', {
      peer: { ip: payload.ip, port: payload.port, token: payload.token },
      files: manifest.files,
    });
  };

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (scanned || connecting) return;
    setScanned(true);
    setConnecting(true);
    setError(null);
    setWifiStatus(null);

    try {
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error('Invalid QR code. Make sure it is a Flash Send QR.');
      }
      if (!payload.ip || !payload.port || !payload.token || payload.v !== 1) {
        throw new Error('Invalid QR — not a Flash Send session. Re-scan the sender QR.');
      }

      const hasHotspotCreds = !!payload.ssid && !!payload.password;
      const peer = { ip: payload.ip, port: payload.port, token: payload.token };

      if (hasHotspotCreds) {
        const wifiPermOk = await requestWifiPermissions();
        if (!wifiPermOk) {
          throw new Error('WiFi permission denied. Enable Nearby Devices / Location and retry.');
        }

        setWifiStatus(`Joining "${payload.ssid}"…`);
        try {
          await (WifiManager as any).connectToProtectedWifiSSID({
            ssid: payload.ssid,
            password: payload.password,
            isWEP: false,
            isHidden: false,
            timeout: 15,
          });
        } catch (e: any) {
          console.warn('[Scan] connectToProtected threw', e?.message);
          // Continue to polling; some devices throw even on success
        }

        setWifiStatus(`Confirming "${payload.ssid}"…`);
        const landed = await pollForSSID(payload.ssid, 9000, 500);
        if (!landed) {
          throw new Error(
            `Could not auto-join "${payload.ssid}". Open Settings → WiFi, connect to "${payload.ssid}" (password is hidden in QR), then tap Retry.`
          );
        }
        setWifiStatus(`Connected to ${payload.ssid} — fetching files…`);
        await new Promise((r) => setTimeout(r, 900));

        // Try fetch manifest, with scoped-network workaround
        try {
          const manifest = await fetchManifest(peer);
          await completeConnection(payload, manifest);
          return;
        } catch (fetchErr: any) {
          console.warn('[Scan] manifest after join failed, trying forceWifiUsage', fetchErr?.message);
          try {
            await (WifiManager as any).forceWifiUsageWithOptions?.(true, { noInternet: true });
            const manifestRetry = await fetchManifest(peer);
            await completeConnection(payload, manifestRetry);
            return;
          } catch (e2: any) {
            throw new Error(
              `${fetchErr?.message || 'Fetch failed'} — joined hotspot but cannot reach sender. Try: disable Mobile Data, ensure hotspot still on, and retry.`
            );
          }
        }
      } else {
        setWifiStatus('Both devices must be on the same WiFi — connecting…');
        const manifest = await fetchManifest(peer);
        await completeConnection(payload, manifest);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to connect';
      console.error('[Scan] error', msg);
      setError(msg);
      setConnecting(false);
      setScanned(false);
      setWifiStatus(null);
    }
  }, [scanned, connecting, completeConnection]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <View style={styles.permIcon}>
          <MaterialIcons name="camera-alt" size={36} color="white" />
        </View>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permSub}>
          We use the camera only to scan the sender's QR code. No photos are taken.
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission} activeOpacity={0.85}>
          <MaterialIcons name="camera-alt" size={18} color="white" />
          <Text style={styles.grantButtonText}>Grant Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsLink}>
          <Text style={styles.settingsLinkText}>Open Settings</Text>
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
            <View style={styles.scanLine} />
          </View>
          <Text style={styles.viewfinderLabel}>Align QR within the frame</Text>
        </View>
      </CameraView>

      <View style={styles.statusBar}>
        {connecting ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.statusText}>{wifiStatus || 'Connecting…'}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <View style={styles.errorHeader}>
              <MaterialIcons name="error-outline" size={20} color={Colors.error} />
              <Text style={styles.errorTitle}>Could not connect</Text>
            </View>
            <Text style={styles.errorText}>{error}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                onPress={() => {
                  setScanned(false);
                  setError(null);
                  setWifiStatus(null);
                }}
                style={styles.retryBtn}
              >
                <MaterialIcons name="qr-code-scanner" size={18} color="white" />
                <Text style={styles.retryText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>WiFi Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>Point camera at sender's QR code</Text>
          </View>
        )}
      </View>

      <View style={styles.tip}>
        <MaterialIcons name="tips-and-updates" size={18} color={Colors.primary} />
        <Text style={styles.tipText}>
          <Text style={{ fontWeight: '700' }}>Sender on Android?</Text> You'll auto-join its hotspot. If both on same WiFi, just scan — no hotspot needed.
        </Text>
      </View>
    </View>
  );
}

const CORNER_SIZE = 28;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: Colors.background },
  permIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  permSub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  grantButton: { flexDirection: 'row', gap: 8, backgroundColor: Colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: BorderRadius.round, alignItems: 'center', marginTop: 8 },
  grantButtonText: { color: 'white', fontWeight: '700', fontSize: FontSize.md },
  settingsLink: { padding: 8 },
  settingsLinkText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
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
    backgroundColor: Colors.primary,
    opacity: 0.9,
    top: '50%',
    shadowColor: Colors.primary,
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: Colors.primary },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderBottomRightRadius: 12 },
  statusBar: { backgroundColor: Colors.background, padding: Spacing.md, minHeight: 72, justifyContent: 'center', borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  statusText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1, fontWeight: '600' },
  errorBox: { gap: Spacing.sm },
  errorHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  errorTitle: { color: Colors.error, fontWeight: '700', fontSize: FontSize.md },
  errorText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 18 },
  errorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  retryBtn: { flexDirection: 'row', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, alignItems: 'center' },
  retryText: { color: 'white', fontWeight: '700', fontSize: 13 },
  settingsBtn: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, borderWidth: 1, borderColor: Colors.surfaceBorder, justifyContent: 'center' },
  settingsBtnText: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.surface, padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceBorder },
  tipText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
});
