// src/screens/HostScreen.tsx
// Android-only sender: creates LocalOnlyHotspot, QR includes ssid/password for auto-join

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  AppState,
  Linking,
  Platform,
  Alert,
  PermissionsAndroid,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';

import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { generateToken, startServer, stopServer, DEFAULT_PORT } from '../networking/server';
import { getLocalIPAddress, getBestHostIP, isOnWiFi } from '../networking/networkInfo';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { startHotspot, stopHotspot, isHotspotSupported } from 'flash-send-hotspot';
// eslint-disable-next-line import/no-unresolved
import * as SendappNative from 'sendapp-native';
const copyApkToCache = (SendappNative as any).copyApkToCache as (pkg: string) => Promise<string>;
const getApkSize = (SendappNative as any).getApkSize as (pkg: string) => number;

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function requestHotspotPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    // Android 13+ needs NEARBY_WIFI_DEVICES, <=32 needs ACCESS_FINE_LOCATION
    const apiLevel = Platform.Version as number;
    const perms: any[] = [];
    if (apiLevel >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES as string);
      // Location not needed for hotspot on 13+, but some OEMs still want it for LocalOnlyHotspot
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    if (perms.length === 0) return true;
    const results = await PermissionsAndroid.requestMultiple(perms as any);
    const granted = Object.values(results).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    return granted;
  } catch (e) {
    console.warn('[Host] permission request failed', e);
    return false;
  }
}

export default function HostScreen() {
  const navigation = useNavigation<any>();
  const [localIP, setLocalIP] = useState('...');
  const [loading, setLoading] = useState(true);
  const [wifiWarning, setWifiWarning] = useState(false);
  const [sessionToken] = useState(() => generateToken());
  const [hotspotInfo, setHotspotInfo] = useState<{ ssid: string; password: string } | null>(null);
  const [hotspotLoading, setHotspotLoading] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const [resolvedCount, setResolvedCount] = useState(0);
  const appStateRef = useRef(AppState.currentState);

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const fileList = Object.values(selectedFiles);
  const totalSize = fileList.reduce((sum, f) => sum + (f.size || 0), 0);
  const { setSession, setSessionState, replaceFiles } = useTransferStore();

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

  const setupServer = useCallback(async () => {
    setLoading(true);
    setHotspotError(null);
    setWifiWarning(false);

    let hotspotCreds: { ssid: string; password: string } | null = null;

    if (shouldCreateHotspot) {
      setHotspotLoading(true);
      const permOk = await requestHotspotPermissions();
      if (!permOk) {
        setHotspotError('WiFi/Location permission denied. Enable Nearby Devices and Location to auto-create hotspot.');
        setHotspotLoading(false);
      } else {
        try {
          hotspotCreds = await startHotspot();
          setHotspotInfo(hotspotCreds);
          console.log('[Host] Hotspot ready', hotspotCreds.ssid);
        } catch (e: any) {
          const msg = e?.message || 'Failed to create hotspot';
          console.warn('[Host] Hotspot failed', msg);
          if (msg.includes('PERMISSION_DENIED') || msg.includes('Location') || msg.includes('permission')) {
            setHotspotError(
              'Location is required on Android 12 and below for hotspot. Enable Location Services and grant permission, then retry.'
            );
          } else if (msg.includes('Tethering disallowed')) {
            setHotspotError('Tethering blocked by carrier/device policy. Try disabling existing hotspot.');
          } else if (msg.includes('Incompatible')) {
            setHotspotError('Hotspot incompatible: disable existing hotspot/WiFi Direct and retry.');
          } else {
            setHotspotError(`${msg} — tap Retry. If it persists, force-close the app and retry.`);
          }
          setHotspotInfo(null);
        } finally {
          setHotspotLoading(false);
        }
      }
    }

    if (!hotspotCreds) {
      const onWifi = await isOnWiFi();
      if (!onWifi) setWifiWarning(true);
    }

    // Give hotspot a moment to settle, then get best IP
    if (hotspotCreds) {
      await new Promise((r) => setTimeout(r, 900));
    }
    // Use best IP probe: we haven't started server yet, so probe will fail — fallback to getLocalIPAddress
    let ip = await getLocalIPAddress();
    // If hotspot creds exist and ip is still 0.0.0.0, force hotspot gateway
    if (hotspotCreds && (ip === '0.0.0.0' || ip === '127.0.0.1')) {
      ip = '192.168.43.1';
    }
    setLocalIP(ip);

    // Resolve file list: handle APKs and get sizes
    const files = Object.values(useSelectionStore.getState().selectedFiles);
    if (files.length === 0) {
      setSession({ token: sessionToken, localIP: ip, port: DEFAULT_PORT });
      setSessionState('hosting');
      // Start server with empty manifest (receiver can still connect and push)
      try {
        await startServer(sessionToken, [], () => undefined);
      } catch (e: any) {
        console.error('[Host] startServer empty failed', e);
        Alert.alert('Server failed', e?.message || 'Could not start sharing server. Close other hotspot apps and retry.');
      }
      setLoading(false);
      return;
    }

    // Resolve each file: APKs -> copy to cache; others -> get size
    const resolvedFiles: typeof files = [];
    const manifestEntries: { id: string; name: string; size: number; mimeType: string; checksum: string }[] = [];
    const fileMap: Record<string, { uri: string; name: string; size: number; mimeType: string }> = {};

    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx];
      setResolvedCount(idx + 1);
      let uri = f.uri;
      let size = f.size;
      let name = f.name;

      try {
        if (f.tab === 'Apps') {
          // f.uri is packageName, need to copy APK to cache
          const pkg = f.uri;
          const apkPath = await copyApkToCache(pkg);
          uri = `file://${apkPath}`;
          if (size === 0) {
            size = getApkSize(pkg) || 0;
            if (size === 0) {
              const info: any = await FileSystem.getInfoAsync(uri);
              size = info.exists ? (info.size ?? 0) : 0;
            }
          }
          // name already like "AppName.apk"
        } else {
          // For media/files, ensure size
          if (size === 0) {
            try {
              const info: any = await FileSystem.getInfoAsync(uri);
              if (info.exists && info.size != null) size = info.size;
            } catch {}
          }
          // If uri is content:// and FileSystem can't get size, keep 0 (client will tolerate small diff)
        }
      } catch (err) {
        console.warn(`[Host] Failed to resolve ${f.name}`, err);
      }

      const entry = {
        id: f.id,
        name,
        size: size || 0,
        mimeType: f.mimeType,
        checksum: `${size || 0}`,
      };
      manifestEntries.push(entry);
      fileMap[f.id] = { uri, name, size: size || 0, mimeType: f.mimeType };
      resolvedFiles.push({ ...f, size: size || 0, uri });
    }

    // Update transfer store with outgoing files (with resolved sizes)
    replaceFiles(
      resolvedFiles.map((f) => ({
        id: f.id,
        name: f.name,
        size: (fileMap[f.id]?.size || 0),
        mimeType: f.mimeType,
        direction: 'outgoing' as const,
        localUri: fileMap[f.id]?.uri,
      }))
    );

    setSession({ token: sessionToken, localIP: ip, port: DEFAULT_PORT });
    setSessionState('hosting');

    try {
      await startServer(sessionToken, manifestEntries, (id) => fileMap[id]);
      // After server start, try to get better IP by probing self
      const best = await getBestHostIP(DEFAULT_PORT, sessionToken);
      if (best && best !== ip && best !== '0.0.0.0') {
        setLocalIP(best);
        // Update session with best IP for display, token unchanged
        setSession({ token: sessionToken, localIP: best, port: DEFAULT_PORT });
      }
    } catch (e: any) {
      console.error('[Host] startServer failed', e);
      Alert.alert('Server error', e?.message || 'Failed to start file server. Port may be busy. Close other transfers and retry.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, shouldCreateHotspot, replaceFiles, setSession, setSessionState]);

  useEffect(() => {
    setupServer();
    const sub = AppState.addEventListener('change', (next) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        console.log('[Host] returned to foreground');
      }
      appStateRef.current = next;
      if (next.match(/inactive|background/) && hotspotInfo) {
        console.log('[Host] backgrounded with hotspot');
      }
    });
    return () => {
      sub.remove();
      stopServer();
      if (shouldCreateHotspot) {
        try { stopHotspot(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetryHotspot = () => {
    try { stopHotspot(); } catch {}
    stopServer();
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

  const totalFiles = fileList.length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ready to Send</Text>
        <View style={{ width: 40 }} />
      </View>

      {shouldCreateHotspot ? (
        hotspotLoading ? (
          <View style={styles.hotspotCard}>
            <ActivityIndicator color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.hotspotText}>Creating hotspot…</Text>
              <Text style={styles.hotspotSub}>This takes a few seconds</Text>
            </View>
          </View>
        ) : hotspotError ? (
          <View style={[styles.hotspotCard, styles.hotspotError]}>
            <MaterialIcons name="error-outline" size={20} color={Colors.error} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hotspotErrorText}>{hotspotError}</Text>
              <View style={styles.hotspotActions}>
                <TouchableOpacity onPress={handleRetryHotspot} style={styles.retryHotspotBtn}>
                  <MaterialIcons name="refresh" size={16} color="white" />
                  <Text style={styles.retryHotspotText}>Retry</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.retryHotspotBtnSecondary}>
                  <Text style={styles.retryHotspotTextSecondary}>Open Settings</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : hotspotInfo ? (
          <View style={[styles.hotspotCard, styles.hotspotSuccess]}>
            <MaterialIcons name="wifi-tethering" size={20} color={Colors.success} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.hotspotText, { color: Colors.success }]}>Hotspot ready: {hotspotInfo.ssid}</Text>
              <Text style={styles.hotspotSub}>Receiver will auto-join after scanning</Text>
            </View>
            <MaterialIcons name="check-circle" size={20} color={Colors.success} />
          </View>
        ) : null
      ) : null}

      {wifiWarning && !hotspotInfo && (
        <View style={styles.wifiWarning}>
          <MaterialIcons name="wifi-off" size={20} color={Colors.warning} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.wifiWarningTitle}>Not on WiFi</Text>
            <Text style={styles.wifiWarningText}>Both devices must be on the same WiFi, or sender must create a hotspot. Pull down WiFi and connect.</Text>
          </View>
          <TouchableOpacity onPress={() => Linking.sendIntent?.('android.settings.WIFI_SETTINGS' as any) || Linking.openSettings()} style={styles.wifiBtn}>
            <Text style={styles.wifiBtnText}>WiFi</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.qrContainer}>
        {loading || hotspotLoading ? (
          <View style={styles.qrLoading}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={styles.qrLoadingText}>
              {resolvedCount > 0 && totalFiles > 0 ? `Preparing ${resolvedCount}/${totalFiles}…` : 'Starting server…'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.qrBox}>
              <QRCode value={qrValue} size={220} backgroundColor="white" color="#0A0A1A" />
            </View>
            <View style={styles.qrInfo}>
              <MaterialIcons name="qr-code-scanner" size={18} color={Colors.primary} />
              <Text style={styles.qrInstruction}>Scan on the receiver</Text>
            </View>
            <Text style={styles.qrSub}>
              Receiver taps <Text style={styles.bold}>Receive</Text> → scans this. {hotspotInfo ? 'It will auto-join your hotspot.' : 'Ensure both on same WiFi first.'}
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
              <Text style={styles.sessionValue} numberOfLines={1}>{hotspotInfo.ssid}</Text>
            </View>
          )}
          <View style={styles.sessionRow}>
            <MaterialIcons name="router" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>IP</Text>
            <Text style={styles.sessionValue} selectable>{localIP}:{DEFAULT_PORT}</Text>
          </View>
          <View style={styles.sessionRow}>
            <MaterialIcons name="vpn-key" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>Token</Text>
            <Text style={styles.sessionValue} numberOfLines={1}>{sessionToken.substring(0, 8)}••••</Text>
          </View>
          <View style={styles.sessionRow}>
            <MaterialIcons name="folder" size={16} color={Colors.textMuted} />
            <Text style={styles.sessionLabel}>Files</Text>
            <Text style={styles.sessionValue}>{totalFiles} • {formatBytes(totalSize)}</Text>
          </View>
        </View>
      )}

      {totalFiles > 0 && (
        <View style={styles.filesSummary}>
          <Text style={styles.filesSummaryTitle}>
            {totalFiles} file{totalFiles !== 1 ? 's' : ''} • {formatBytes(fileList.reduce((s, f) => s + (f.size || 0), 0))}
          </Text>
          {fileList.slice(0, 6).map((f) => (
            <View key={f.id} style={styles.fileRow}>
              <MaterialIcons
                name={f.tab === 'Apps' ? 'android' : f.tab === 'Photos' ? 'image' : f.tab === 'Videos' ? 'videocam' : f.tab === 'Audio' ? 'audiotrack' : 'insert-drive-file'}
                size={14}
                color={Colors.textMuted}
              />
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              {f.size > 0 && <Text style={styles.fileSize}>{formatBytes(f.size)}</Text>}
            </View>
          ))}
          {totalFiles > 6 && (
            <Text style={styles.fileMore}>+ {totalFiles - 6} more</Text>
          )}
        </View>
      )}

      {totalFiles === 0 && !loading && (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="qr-code-2" size={40} color={Colors.primary} />
          </View>
          <Text style={styles.emptyStateTitle}>No files selected</Text>
          <Text style={styles.emptyStateSubtitle}>
            Go back, pick files from any tab, then tap Send again. Or share this QR for the receiver to connect.
          </Text>
          <TouchableOpacity onPress={handleCancel} style={styles.emptyBackBtn}>
            <MaterialIcons name="arrow-back" size={18} color="white" />
            <Text style={styles.emptyBackText}>Pick Files</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.hintCard}>
        <MaterialIcons name="lightbulb" size={16} color={Colors.warning} />
        <Text style={styles.hintText}>Keep this screen open. Hotspot is tied to the app — closing the app will stop sharing. Large files transfer fastest when both devices stay on this screen.</Text>
      </View>

      {!loading && totalFiles > 0 && (
        <TouchableOpacity
          onPress={() => (navigation as any).navigate('Transfer')}
          style={styles.viewTransferBtn}
          activeOpacity={0.85}
        >
          <MaterialIcons name="sync" size={20} color="white" />
          <Text style={styles.viewTransferText}>View Transfer Status</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl + 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  backButton: { padding: Spacing.sm, marginLeft: -Spacing.sm },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  hotspotCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.md,
    alignItems: 'flex-start',
    gap: Spacing.sm,
    elevation: 1,
  },
  hotspotSuccess: { backgroundColor: 'rgba(16, 185, 129, 0.08)', borderColor: Colors.success },
  hotspotError: { backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: Colors.error },
  hotspotText: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: '700' },
  hotspotSub: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: 2 },
  hotspotErrorText: { color: Colors.error, fontSize: FontSize.sm, lineHeight: 18 },
  hotspotActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  retryHotspotBtn: { flexDirection: 'row', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.round, alignItems: 'center' },
  retryHotspotText: { color: 'white', fontWeight: '700', fontSize: 13 },
  retryHotspotBtnSecondary: { backgroundColor: Colors.surfaceElevated, paddingHorizontal: 14, paddingVertical: 8, borderRadius: BorderRadius.round, borderWidth: 1, borderColor: Colors.surfaceBorder },
  retryHotspotTextSecondary: { color: Colors.textSecondary, fontWeight: '600', fontSize: 13 },
  wifiWarning: {
    flexDirection: 'row',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: Spacing.md,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  wifiWarningTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: 14 },
  wifiWarningText: { color: Colors.textSecondary, fontSize: 13, lineHeight: 16, marginTop: 2 },
  wifiBtn: { backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.round },
  wifiBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
  qrContainer: { alignItems: 'center', marginVertical: Spacing.md, gap: Spacing.md, minHeight: 280, justifyContent: 'center' },
  qrLoading: { alignItems: 'center', gap: Spacing.md, minHeight: 260, justifyContent: 'center' },
  qrLoadingText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  qrBox: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: BorderRadius.xl,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  qrInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  qrInstruction: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  qrSub: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, maxWidth: 320 },
  bold: { fontWeight: '700', color: Colors.textPrimary },
  sessionCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    marginBottom: Spacing.md,
    elevation: 1,
  },
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sessionLabel: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  sessionValue: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', maxWidth: 180, textAlign: 'right' },
  filesSummary: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: 6,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  filesSummaryTitle: { color: Colors.primary, fontWeight: '700', fontSize: FontSize.md, marginBottom: 4 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  fileName: { flex: 1, color: Colors.textSecondary, fontSize: 13 },
  fileSize: { color: Colors.textMuted, fontSize: 11 },
  fileMore: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic', marginTop: 4 },
  emptyState: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.md, marginTop: 8 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: Colors.primary },
  emptyStateTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  emptyStateSubtitle: { fontSize: FontSize.md, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  emptyBackBtn: { flexDirection: 'row', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: BorderRadius.round, alignItems: 'center', marginTop: 6 },
  emptyBackText: { color: 'white', fontWeight: '700', fontSize: 14 },
  hintCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  hintText: { flex: 1, color: Colors.textSecondary, fontSize: 13, lineHeight: 18 },
  viewTransferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: BorderRadius.round,
    marginTop: Spacing.md,
  },
  viewTransferText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
