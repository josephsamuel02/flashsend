// src/screens/HostScreen.tsx
// Send flow with Platform.OS branch per Phase 0-3:
// - Android sender: creates real hotspot via startLocalOnlyHotspot, QR includes ssid/password
// - iOS sender: fallback manual instructions, QR includes only ip/port/token

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';

import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { generateToken, startServer, stopServer, DEFAULT_PORT } from '../networking/server';
import { getLocalIPAddress, isOnWiFi } from '../networking/networkInfo';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { startHotspot, stopHotspot, isHotspotSupported } from 'flash-send-hotspot';

export default function HostScreen() {
  const navigation = useNavigation();
  const [localIP, setLocalIP] = useState('...');
  const [loading, setLoading] = useState(true);
  const [wifiWarning, setWifiWarning] = useState(false);
  const [sessionToken] = useState(() => generateToken());
  const [hotspotInfo, setHotspotInfo] = useState<{ ssid: string; password: string } | null>(null);
  const [hotspotLoading, setHotspotLoading] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const appStateRef = useRef(AppState.currentState);

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const { setSession, setSessionState, addFiles } = useTransferStore();

  // Platform branch: only Android attempts hotspot
  const shouldCreateHotspot = Platform.OS === 'android' && isHotspotSupported();

  const qrValue = JSON.stringify(
    shouldCreateHotspot && hotspotInfo
      ? {
          ssid: hotspotInfo.ssid,
          password: hotspotInfo.password,
          ip: localIP,
          port: DEFAULT_PORT,
          token: sessionToken,
          v: 1,
        }
      : {
          ip: localIP,
          port: DEFAULT_PORT,
          token: sessionToken,
          v: 1,
        }
  );

  useEffect(() => {
    setupServer();
    // AppState listener: hotspot is tied to app lifecycle (Phase 5)
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        // Returned to foreground — check if hotspot still alive (Android only)
        if (shouldCreateHotspot && hotspotInfo) {
          // No direct check, but we can warn user that hotspot may have been torn down
          // The next onFailed will handle it; just show a hint if needed
        }
      }
      appStateRef.current = next;
      if (next.match(/inactive|background/) && shouldCreateHotspot && hotspotInfo) {
        // Backgrounding can tear down LocalOnlyHotspot — we keep reservation but warn on return
        console.log('[Host] App backgrounded with hotspot active');
      }
    });
    return () => {
      sub.remove();
      stopServer();
      if (shouldCreateHotspot) {
        try { stopHotspot(); } catch {}
      }
    };
  }, []);

  const setupServer = async () => {
    setLoading(true);
    setHotspotError(null);

    // Phase 3: branch on sender platform
    let hotspotCreds: { ssid: string; password: string } | null = null;

    if (shouldCreateHotspot) {
      setHotspotLoading(true);
      try {
        hotspotCreds = await startHotspot();
        setHotspotInfo(hotspotCreds);
      } catch (e: any) {
        const msg = e?.message || 'Failed to create hotspot';
        // Handle stale reservation, permission, location services off
        if (msg.includes('PERMISSION_DENIED') || msg.includes('Location')) {
          setHotspotError(
            'Location Services must be enabled on Android 12 and below to create a hotspot. Please enable Location in Settings and retry.'
          );
        } else if (msg.includes('Tethering disallowed') || msg.includes('Incompatible')) {
          setHotspotError(msg + ' — try disabling existing hotspot/WiFi Direct and retry.');
        } else {
          setHotspotError(msg + ' — tap Retry. If it persists, kill the app and try again (stale reservation).');
        }
        // Fall back to manual flow: still start server on regular WiFi so user can manually share network
        setHotspotInfo(null);
      } finally {
        setHotspotLoading(false);
      }
    } else if (Platform.OS === 'ios') {
      // iOS cannot create hotspot — show manual instructions (handled in UI)
    }

    // Check WiFi (only relevant if no hotspot was created)
    if (!hotspotCreds) {
      const onWifi = await isOnWiFi();
      if (!onWifi) setWifiWarning(true);
    }

    // Get IP *after* hotspot creation so we get the hotspot's gateway IP (192.168.43.1 etc)
    const ip = await getLocalIPAddress();
    setLocalIP(ip);

    const files = Object.values(selectedFiles);

    if (files.length === 0) {
      setSession({ token: sessionToken, localIP: ip, port: DEFAULT_PORT });
      setSessionState('hosting');
      setLoading(false);
      return;
    }

    const manifest = await Promise.all(
      files.map(async (f) => {
        let size = f.size;
        if (size === 0) {
          try {
            const info = await FileSystem.getInfoAsync(f.uri, { size: true });
            size = info.exists ? (info.size ?? 0) : 0;
          } catch {}
        }
        return {
          id: f.id,
          name: f.name,
          size,
          mimeType: f.mimeType,
          checksum: `${size}`,
        };
      })
    );

    addFiles(
      files.map((f, i) => ({
        id: f.id,
        name: f.name,
        size: manifest[i]?.size ?? 0,
        mimeType: f.mimeType,
        direction: 'outgoing' as const,
        localUri: f.uri,
      }))
    );

    setSession({ token: sessionToken, localIP: ip, port: DEFAULT_PORT });
    setSessionState('hosting');

    const fileMap: Record<string, { uri: string; name: string; size: number; mimeType: string }> = {};
    files.forEach((f, i) => {
      fileMap[f.id] = { uri: f.uri, name: f.name, size: manifest[i]?.size ?? 0, mimeType: f.mimeType };
    });

    await startServer(sessionToken, manifest, (id) => fileMap[id]);
    setLoading(false);
  };

  const handleRetryHotspot = () => {
    // Clean stale reservation then retry
    try { stopHotspot(); } catch {}
    setHotspotInfo(null);
    setHotspotError(null);
    setupServer();
  };

  const handleCancel = () => {
    stopServer();
    if (shouldCreateHotspot) {
      try { stopHotspot(); } catch {}
    }
    useTransferStore.getState().clearSession();
    navigation.goBack();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ready to Send</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Platform-specific hotspot status */}
      {shouldCreateHotspot ? (
        hotspotLoading ? (
          <View style={styles.hotspotCard}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.hotspotText}>Creating hotspot...</Text>
          </View>
        ) : hotspotError ? (
          <View style={[styles.hotspotCard, styles.hotspotError]}>
            <MaterialIcons name="error-outline" size={18} color={Colors.error} />
            <Text style={styles.hotspotErrorText}>{hotspotError}</Text>
            <TouchableOpacity onPress={handleRetryHotspot} style={styles.retryHotspotBtn}>
              <Text style={styles.retryHotspotText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.retryHotspotBtnSecondary}>
              <Text style={styles.retryHotspotTextSecondary}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        ) : hotspotInfo ? (
          <View style={[styles.hotspotCard, styles.hotspotSuccess]}>
            <MaterialIcons name="wifi-tethering" size={18} color={Colors.success} />
            <Text style={styles.hotspotText}>Hotspot ready: {hotspotInfo.ssid}</Text>
            <Text style={styles.hotspotSub}>Receiver will auto-join on scan</Text>
          </View>
        ) : null
      ) : Platform.OS === 'ios' ? (
        <View style={styles.hotspotCard}>
          <MaterialIcons name="info-outline" size={18} color={Colors.primary} />
          <Text style={styles.hotspotText}>
            Make sure both devices are on the same WiFi network, or turn on your Personal Hotspot before the receiver scans.
          </Text>
        </View>
      ) : null}

      {wifiWarning && !hotspotInfo && (
        <View style={styles.wifiWarning}>
          <MaterialIcons name="wifi-off" size={18} color={Colors.warning} />
          <Text style={styles.wifiWarningText}>Not connected to WiFi. Both devices must be on the same network.</Text>
        </View>
      )}

      <View style={styles.qrContainer}>
        {loading || hotspotLoading ? (
          <ActivityIndicator color={Colors.primary} size="large" />
        ) : (
          <>
            <View style={styles.qrBox}>
              <QRCode value={qrValue} size={220} backgroundColor="white" color="#0A0A1A" />
            </View>
            <Text style={styles.qrInstruction}>Show this QR code to the receiving device</Text>
            <Text style={styles.qrSub}>
              The other device must tap <Text style={styles.bold}>Receive</Text> and scan this code
              {shouldCreateHotspot && hotspotInfo ? ' — it will auto-join your hotspot.' : ''}
            </Text>
          </>
        )}
      </View>

      {!loading && !hotspotLoading && (
        <View style={styles.sessionCard}>
          {hotspotInfo && (
            <View style={styles.sessionRow}>
              <MaterialIcons name="wifi-tethering" size={16} color={Colors.textMuted} />
              <Text style={styles.sessionLabel}>Hotspot</Text>
              <Text style={styles.sessionValue}>{hotspotInfo.ssid}</Text>
            </View>
          )}
          <View style={styles.sessionRow}>
            <MaterialIcons name="wifi" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>Device IP</Text>
            <Text style={styles.sessionValue}>{localIP}</Text>
          </View>
          <View style={styles.sessionRow}>
            <MaterialIcons name="router" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>Port</Text>
            <Text style={styles.sessionValue}>{DEFAULT_PORT}</Text>
          </View>
          <View style={styles.sessionRow}>
            <MaterialIcons name="lock" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>Session</Text>
            <Text style={styles.sessionValue} numberOfLines={1}>
              {sessionToken.substring(0, 12)}...
            </Text>
          </View>
        </View>
      )}

      {Object.keys(selectedFiles).length > 0 && (
        <View style={styles.filesSummary}>
          <Text style={styles.filesSummaryTitle}>
            {Object.keys(selectedFiles).length} file{Object.keys(selectedFiles).length !== 1 ? 's' : ''} ready to send
          </Text>
          {Object.values(selectedFiles).slice(0, 5).map((f) => (
            <Text key={f.id} style={styles.fileName} numberOfLines={1}>
              • {f.name}
            </Text>
          ))}
          {Object.keys(selectedFiles).length > 5 && (
            <Text style={styles.fileName}>• ...and {Object.keys(selectedFiles).length - 5} more</Text>
          )}
        </View>
      )}

      {Object.keys(selectedFiles).length === 0 && (
        <View style={styles.emptyState}>
          <MaterialIcons name="qr-code-2" size={64} color={Colors.primary} />
          <Text style={styles.emptyStateTitle}>No files selected</Text>
          <Text style={styles.emptyStateSubtitle}>
            You can still generate a QR code for others to scan. Select files below to share them.
          </Text>
        </View>
      )}

      <Text style={styles.hint}>
        💡 Keep this app open during the transfer for best performance. Large transfers may slow down if the app is backgrounded.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  backButton: { padding: Spacing.sm },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  hotspotCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.md,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  hotspotSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: Colors.success,
  },
  hotspotError: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: Colors.error,
  },
  hotspotText: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  hotspotSub: { color: Colors.textMuted, fontSize: FontSize.xs, width: '100%', marginTop: 4 },
  hotspotErrorText: { flex: 1, color: Colors.error, fontSize: FontSize.sm },
  retryHotspotBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
  },
  retryHotspotText: { color: 'white', fontWeight: '700', fontSize: FontSize.sm },
  retryHotspotBtnSecondary: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  retryHotspotTextSecondary: { color: Colors.textSecondary, fontWeight: '600', fontSize: FontSize.sm },
  wifiWarning: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255, 184, 0, 0.15)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  wifiWarningText: { flex: 1, color: Colors.warning, fontSize: FontSize.sm },
  qrContainer: {
    alignItems: 'center',
    marginVertical: Spacing.lg,
    gap: Spacing.md,
    minHeight: 280,
    justifyContent: 'center',
  },
  qrBox: {
    padding: Spacing.md,
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  qrInstruction: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  qrSub: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  bold: { fontWeight: '700', color: Colors.textPrimary },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.lg,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sessionLabel: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm },
  sessionValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  filesSummary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  filesSummaryTitle: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: FontSize.md,
    marginBottom: Spacing.xs,
  },
  fileName: { color: Colors.textSecondary, fontSize: FontSize.sm },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  emptyStateTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyStateSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
