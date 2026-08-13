// src/screens/ScanScreen.tsx
// Camera screen for scanning the host QR code (Receive flow) — Phase 6

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
import * as FileSystem from 'expo-file-system';

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
  const [error, setError] = useState<string | null>(null);

  const { setSession, setSessionState, addFiles 
} = useTransferStore();

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

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanned || connecting) return;
    setScanned(true);
    setConnecting(true);
    setError(null);

    try {
      const payload = JSON.parse(data);
      if (!payload.ip || !payload.port || !payload.token || payload.v !== 1) {
        throw new Error('Invalid QR code — not a SendApp session');
      }

      const peer = { ip: payload.ip, port: payload.port, token: payload.token };
      
      // Fetch manifest from the host
      const manifest = await fetchManifest(peer);

      // Set up THIS device's own server so the host can also pull from us
      const myToken = generateToken();
      const myIP = await getLocalIPAddress();
      await startServer(myToken, [], () => undefined);

      // Add incoming files to transfer store
      addFiles(
        manifest.files.map((f) => ({
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

      // Navigate to transfer screen and start downloading
      (navigation as any).navigate('Transfer', { peer, files: manifest.files });

    } catch (err: any) {
      setError(err.message || 'Failed to connect. Make sure both devices are on the same WiFi network.');
      setConnecting(false);
      setScanned(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Camera */}
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      >
        {/* Viewfinder overlay */}
        <View style={styles.overlay}>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>
      </CameraView>

      {/* Status */}
      <View style={styles.statusBar}>
        {connecting ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.primary} size="small" />
            <Text style={styles.statusText}>Connecting to sender...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorRow}>
            <MaterialIcons name="error" size={20} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => { setScanned(false); setError(null); }}>
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
          Both devices must be on the same WiFi network for the transfer to work.
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
  statusText: { color: Colors.textSecondary, fontSize: FontSize.sm },
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
