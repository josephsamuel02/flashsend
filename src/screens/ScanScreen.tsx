// src/screens/ScanScreen.tsx
// Receive flow with auto-join per Phase 4 + iOS polling bug workaround + scoped-network bind handling

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
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

export default function ScanScreen() {
  const navigation = useNavigation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [wifiStatus, setWifiStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { setSession, setSessionState, addFiles } = useTransferStore();

  if (!permission) return <ActivityIndicator color={Colors.primary} style={styles.centered} />;

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="camera-alt" size={48} color={Colors.primary} />
        <Text style={styles.permTitle}>Camera Required</Text>
        <Text style={styles.permSub}>Camera access is needed to scan the QR code on the sending device.</Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const pollForSSID = async (targetSSID: string, timeoutMs = 8000, intervalMs = 500): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const current = await WifiManager.getCurrentWifiSSID();
        // getCurrentWifiSSID may return quoted SSID like "\"MyHotspot\""
        const normalized = current?.replace(/^"|"$/g, '');
        if (normalized === targetSSID) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return false;
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanned || connecting) return;
    setScanned(true);
    setConnecting(true);
    setError(null);
    setWifiStatus(null);

    try {
      const payload = JSON.parse(data);
      if (!payload.ip || !payload.port || !payload.token || payload.v !== 1) {
        throw new Error('Invalid QR code — not a SendApp session');
      }

      const hasHotspotCreds = !!payload.ssid && !!payload.password;
      const peer = { ip: payload.ip, port: payload.port, token: payload.token };

      // Phase 4: if payload includes ssid/password (Android sender), auto-join
      if (hasHotspotCreds) {
        setWifiStatus(`Joining ${payload.ssid}...`);
        try {
          // react-native-wifi-reborn wraps WifiNetworkSpecifier (Android) and NEHotspotConfigurationManager (iOS)
          // Use the object form for timeout control
          await WifiManager.connectToProtectedWifiSSID({
            ssid: payload.ssid,
            password: payload.password,
            isWEP: false,
            isHidden: false,
            timeout: 15,
          } as any);
        } catch (e: any) {
          // On iOS, this can resolve as success even when failed — we poll anyway, don't throw yet
          console.warn('[Scan] connectToProtectedWifiSSID threw:', e);
        }

        // Polling workaround for iOS bug (Phase 1 step 4) — also useful on Android to confirm
        setWifiStatus(`Confirming connection to ${payload.ssid}...`);
        const landed = await pollForSSID(payload.ssid, 8000, 500);
        if (!landed) {
          // Fallback screen: don't silently hang
          throw new Error(
            `Could not auto-join "${payload.ssid}". Please open Settings > WiFi and connect to "${payload.ssid}" manually (password in QR), then tap Retry.`
          );
        }
        setWifiStatus(`Connected to ${payload.ssid}`);
        // Brief pause to let DHCP settle
        await new Promise((r) => setTimeout(r, 800));

        // Scoped-network bind issue (Phase 4 step 5): if manifest fetch fails, try forceWifiUsage
        try {
          // Try normal fetch first
          const manifest = await fetchManifest(peer);
          // Success — proceed to normal flow below
          await completeConnection(payload, manifest);
          return;
        } catch (fetchErr: any) {
          console.warn('[Scan] manifest fetch failed after join, trying forceWifiUsage:', fetchErr);
          // Try binding process to WiFi (Android). forceWifiUsageWithOptions routes app traffic over WiFi even if it has no internet
          try {
            await (WifiManager as any).forceWifiUsageWithOptions(true, { noInternet: true });
            // Retry manifest after bind
            const manifestRetry = await fetchManifest(peer);
            await completeConnection(payload, manifestRetry);
            return;
          } catch (e2) {
            // Even after bind, still failed — surface error with hint
            throw new Error(
              fetchErr.message +
                ' — joined hotspot but manifest fetch timed out. This can happen when Android routes fetches over cellular instead of the hotspot. Try toggling mobile data off and retry.'
            );
          }
        }
      }

      // No hotspot creds (iOS sender) or already handled above via completeConnection
      // For non-hotspot payload, just fetch manifest directly (both devices already on same WiFi)
      if (!hasHotspotCreds) {
        // Show manual hint briefly
        setWifiStatus('Ensure both devices are on the same WiFi network');
        const manifest = await fetchManifest(peer);
        await completeConnection(payload, manifest);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to connect. Make sure both devices are on the same WiFi network.');
      setConnecting(false);
      setScanned(false);
      setWifiStatus(null);
    }
  };

  const completeConnection = async (payload: any, manifest: any) => {
    // Set up THIS device's own server so host can also pull from us
    const myToken = generateToken();
    const myIP = await getLocalIPAddress();
    await startServer(myToken, [], () => undefined);

    addFiles(
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

    (navigation as any).navigate('Transfer', {
      peer: { ip: payload.ip, port: payload.port, token: payload.token },
      files: manifest.files,
    });
  };

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
          </View>
        </View>
      </CameraView>

      <View style={styles.statusBar}>
        {connecting ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.statusText}>{wifiStatus || 'Connecting to sender...'}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorRow}>
            <MaterialIcons name="error" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              onPress={() => {
                setScanned(false);
                setError(null);
                setWifiStatus(null);
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <MaterialIcons name="qr-code-scanner" size={20} color={Colors.primary} />
            <Text style={styles.statusText}>Point camera at sending device's QR code</Text>
          </View>
        )}
      </View>

      <View style={styles.tip}>
        <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
        <Text style={styles.tipText}>
          If the sender is Android, you'll auto-join its hotspot after scanning. If the sender is iPhone, make sure both devices are on the same WiFi first.
        </Text>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, backgroundColor: Colors.background },
  permTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  permSub: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  grantButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.round },
  grantButtonText: { color: 'white', fontWeight: '700', fontSize: FontSize.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 50,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  backButton: { padding: Spacing.sm },
  headerTitle: { flex: 1, textAlign: 'center', color: 'white', fontWeight: '700', fontSize: FontSize.xl },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  viewfinder: {
    width: 240,
    height: 240,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderColor: Colors.primary,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH },
  statusBar: {
    backgroundColor: Colors.background,
    padding: Spacing.md,
    minHeight: 60,
    justifyContent: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  statusText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  errorText: { flex: 1, color: Colors.error, fontSize: FontSize.sm },
  retryText: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.sm },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
  },
  tipText: { flex: 1, color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 18 },
});
