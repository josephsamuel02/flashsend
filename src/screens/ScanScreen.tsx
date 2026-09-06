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
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius } from '../theme/colors';

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
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
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
          throw new Error('Permission denied. Enable in Settings');
        }

        setWifiStatus(`Joining ${payload.ssid}...`);
        try {
          await (WifiManager as any).connectToProtectedWifiSSID({
            ssid: payload.ssid,
            password: payload.password,
            isWEP: false,
            isHidden: false,
            timeout: 18,
          });
        } catch (e: any) {
          console.warn('[Scan] connect threw:', e?.message);
        }

        setWifiStatus('Connecting...');
        const landed = await pollForSSID(payload.ssid, 12000, 600);
        if (!landed) {
          throw new Error(`Could not join ${payload.ssid}. Connect manually in WiFi settings`);
        }
        
        setWifiStatus('Fetching files...');
        await new Promise((r) => setTimeout(r, 1000));

        let manifest;
        try {
          manifest = await fetchManifest(peer, 10000);
        } catch (fetchErr: any) {
          console.warn('[Scan] Manifest failed:', fetchErr?.message);
          try {
            await (WifiManager as any).forceWifiUsageWithOptions?.(true, { noInternet: true });
            await new Promise(r => setTimeout(r, 500));
            manifest = await fetchManifest(peer, 10000);
          } catch (e2: any) {
            throw new Error('Cannot reach sender. Disable mobile data and retry');
          }
        }
        
        await completeConnection(payload, manifest);
        return;
      } else {
        setWifiStatus('Connecting...');
        const manifest = await fetchManifest(peer, 8000);
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
            <View style={styles.errorActions}>
              <TouchableOpacity onPress={() => { setScanned(false); setError(null); }} style={styles.retryBtn}>
                <MaterialIcons name="qr-code-scanner" size={18} color="white" />
                <Text style={styles.retryText}>Scan Again</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
                <Text style={styles.settingsBtnText}>Settings</Text>
              </TouchableOpacity>
            </View>
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
  errorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: 4 },
  retryBtn: { flexDirection: 'row', gap: 6, backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, alignItems: 'center' },
  retryText: { color: 'white', fontWeight: '700', fontSize: 13 },
  settingsBtn: { backgroundColor: C.surfaceElevated, paddingHorizontal: 16, paddingVertical: 10, borderRadius: BorderRadius.round, borderWidth: 1, borderColor: C.surfaceBorder, justifyContent: 'center' },
  settingsBtnText: { color: C.textSecondary, fontWeight: '600', fontSize: 13 },
});
