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
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius } from '../theme/colors';
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
    const apiLevel = Platform.Version as number;
    const perms: any[] = [];
    if (apiLevel >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES as string);
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    if (perms.length === 0) return true;
    const results = await PermissionsAndroid.requestMultiple(perms as any);
    return Object.values(results).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export default function HostScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
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
        const apiLevel = Platform.Version as number;
        const permName = apiLevel >= 33 ? 'Nearby Devices' : 'Location';
        setHotspotError(
          `${permName} permission is required to create hotspot. Please enable "${permName}" permission in Settings → Apps → Flash Send → Permissions.`
        );
        setHotspotLoading(false);
      } else {
        try {
          hotspotCreds = await startHotspot();
          setHotspotInfo(hotspotCreds);
          console.log('[Host] Hotspot ready:', hotspotCreds.ssid);
        } catch (e: any) {
          const msg = e?.message || 'Failed to create hotspot';
          console.warn('[Host] Hotspot failed:', msg);
          
          // Provide specific, actionable error messages
          if (msg.includes('PERMISSION_DENIED') || msg.includes('Location') || msg.includes('permission')) {
            const apiLevel = Platform.Version as number;
            if (apiLevel <= 32) {
              setHotspotError(
                'Location permission is required on Android 12 and below. Enable Location Services in Quick Settings, then grant Location permission to Flash Send in Settings.'
              );
            } else {
              setHotspotError(
                'Nearby Devices permission required. Grant "Nearby devices" permission in Settings → Apps → Flash Send → Permissions.'
              );
            }
          } else if (msg.includes('Tethering disallowed') || msg.includes('TETHERING_DISALLOWED')) {
            setHotspotError(
              'Hotspot blocked by carrier or device policy. Try: 1) Disable any active hotspot/tethering, 2) Turn WiFi off then on, 3) Restart device.'
            );
          } else if (msg.includes('Incompatible') || msg.includes('INCOMPATIBLE_MODE')) {
            setHotspotError(
              'WiFi is in incompatible mode. Turn off: WiFi Direct, existing hotspot, or VPN. Then retry.'
            );
          } else {
            setHotspotError(
              `Hotspot creation failed: ${msg.slice(0, 100)}. Try: force-close Flash Send, restart device, ensure no other hotspot apps are running.`
            );
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

    // Give hotspot DHCP time to settle
    if (hotspotCreds) {
      await new Promise((r) => setTimeout(r, 1200));
    }
    
    let ip = await getLocalIPAddress();
    
    // For hotspot scenarios, ensure we use the correct gateway IP
    if (hotspotCreds && (ip === '0.0.0.0' || ip === '127.0.0.1' || !ip)) {
      ip = '192.168.43.1'; // Default LocalOnlyHotspot gateway
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
        console.error('[Host] startServer empty failed:', e);
        Alert.alert(
          'Server Error',
          e?.message || 'Could not start sharing server. Another app may be using port 42124. Close other file sharing apps and retry.',
          [{ text: 'OK' }]
        );
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
            } catch (e) {
              console.warn(`[Host] Could not get size for ${f.name}:`, e);
            }
          }
          // If uri is content:// and FileSystem can't get size, keep 0 (client will tolerate small diff)
        }
      } catch (err) {
        console.error(`[Host] Failed to resolve ${f.name}:`, err);
        Alert.alert('File Error', `Could not prepare "${f.name}" for sharing. It will be skipped.`);
        continue; // Skip this file
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

    if (resolvedFiles.length === 0) {
      Alert.alert('No Files', 'All selected files could not be prepared. Please select different files.');
      setLoading(false);
      return;
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
        console.log('[Host] Updated IP from probe:', best);
        setLocalIP(best);
        setSession({ token: sessionToken, localIP: best, port: DEFAULT_PORT });
      }
    } catch (e: any) {
      console.error('[Host] startServer failed:', e);
      Alert.alert(
        'Server Error',
        e?.message || 'Failed to start file server. Port 42124 may be in use. Close other transfers and retry.',
        [{ text: 'OK' }]
      );
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
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color={C.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send Files</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {hotspotLoading ? (
          <View style={styles.statusCard}>
            <ActivityIndicator color={C.primary} />
            <Text style={styles.statusText}>Creating hotspot...</Text>
          </View>
        ) : hotspotError ? (
          <View style={[styles.statusCard, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
            <MaterialIcons name="error-outline" size={24} color={C.error} />
            <Text style={styles.errorTitle}>Hotspot Failed</Text>
            <Text style={styles.errorText}>{hotspotError.split('.')[0]}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity onPress={handleRetryHotspot} style={styles.primaryBtn}>
                <MaterialIcons name="refresh" size={18} color="white" />
                <Text style={styles.primaryBtnText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : hotspotInfo ? (
          <View style={[styles.statusCard, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
            <MaterialIcons name="check-circle" size={24} color={C.success} />
            <Text style={[styles.statusText, { color: C.success }]}>Hotspot Ready</Text>
            <Text style={styles.statusSub}>{hotspotInfo.ssid}</Text>
          </View>
        ) : wifiWarning ? (
          <View style={[styles.statusCard, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
            <MaterialIcons name="wifi-off" size={24} color={C.warning} />
            <Text style={[styles.statusText, { color: C.warning }]}>Not on WiFi</Text>
            <Text style={styles.statusSub}>Connect both devices to same WiFi</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>WiFi Settings</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.qrContainer}>
            <ActivityIndicator color={C.primary} size="large" />
            <Text style={styles.loadingText}>
              {resolvedCount > 0 && totalFiles > 0 ? `${resolvedCount}/${totalFiles}` : 'Preparing...'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.qrContainer}>
              <View style={styles.qrBox}>
                <QRCode value={qrValue} size={240} backgroundColor="white" color="#0A0A1A" />
              </View>
              <Text style={styles.qrLabel}>Scan to connect</Text>
            </View>

            {totalFiles > 0 && (
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <MaterialIcons name="folder" size={18} color={C.textMuted} />
                  <Text style={styles.infoText}>{totalFiles} {totalFiles === 1 ? 'file' : 'files'} • {formatBytes(totalSize)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <MaterialIcons name="router" size={18} color={C.textMuted} />
                  <Text style={styles.infoText}>{localIP}</Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {!loading && totalFiles > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity onPress={() => navigation.navigate('Transfer')} style={styles.primaryBtn}>
            <MaterialIcons name="swap-vert" size={20} color="white" />
            <Text style={styles.primaryBtnText}>View Transfer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, paddingTop: 60 },
  backButton: { padding: 8 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.xl, fontWeight: '700', color: C.textPrimary },
  content: { flex: 1, padding: Spacing.lg, justifyContent: 'center', alignItems: 'center' },
  statusCard: {
    backgroundColor: C.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
    maxWidth: 340,
    marginBottom: Spacing.xl,
  },
  statusText: { fontSize: FontSize.lg, fontWeight: '700', color: C.textPrimary },
  statusSub: { fontSize: FontSize.sm, color: C.textSecondary, textAlign: 'center' },
  errorTitle: { fontSize: FontSize.lg, fontWeight: '700', color: C.error },
  errorText: { fontSize: FontSize.sm, color: C.textSecondary, textAlign: 'center' },
  errorActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  qrContainer: { alignItems: 'center', gap: Spacing.lg },
  qrBox: {
    padding: 20,
    backgroundColor: 'white',
    borderRadius: BorderRadius.xl,
    elevation: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  qrLabel: { fontSize: FontSize.md, fontWeight: '600', color: C.textSecondary },
  loadingText: { fontSize: FontSize.sm, color: C.textMuted, marginTop: Spacing.sm },
  infoCard: {
    backgroundColor: C.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    width: '100%',
    maxWidth: 340,
    marginTop: Spacing.xl,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  infoText: { fontSize: FontSize.sm, color: C.textPrimary, flex: 1 },
  footer: { padding: Spacing.lg },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.round,
  },
  primaryBtnText: { color: 'white', fontWeight: '700', fontSize: FontSize.md },
  secondaryBtn: {
    backgroundColor: C.surfaceElevated,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  secondaryBtnText: { color: C.textSecondary, fontWeight: '600', fontSize: FontSize.md, textAlign: 'center' },
});
