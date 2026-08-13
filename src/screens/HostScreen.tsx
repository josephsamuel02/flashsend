// src/screens/HostScreen.tsx
// Shown when user taps Send — generates QR code with session info (Phase 6)

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
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

export default function HostScreen() {
  const navigation = useNavigation();
  const [localIP, setLocalIP] = useState('...');
  const [loading, setLoading] = useState(true);
  const [wifiWarning, setWifiWarning] = useState(false);
  const [sessionToken] = useState(() => generateToken());

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const { setSession, setSessionState, addFiles } = useTransferStore();

  const qrValue = JSON.stringify({
    ip: localIP,
    port: DEFAULT_PORT,
    token: sessionToken,
    v: 1,
  });

  useEffect(() => {
    setupServer();
    return () => {
      stopServer();
    };
  }, []);

  const setupServer = async () => {
    setLoading(true);

    // Check WiFi
    const onWifi = await isOnWiFi();
    if (!onWifi) setWifiWarning(true);

    const ip = await getLocalIPAddress();
    setLocalIP(ip);

    const files = Object.values(selectedFiles);

    // Build manifest
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
          checksum: `${size}`, // simple size-based integrity check
        };
      })
    );

    // Add outgoing files to transfer store
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

    // Create file provider
    const fileMap: Record<string, { uri: string; name: string; size: number; mimeType: string }> = {};
    files.forEach((f, i) => {
      fileMap[f.id] = { uri: f.uri, name: f.name, size: manifest[i]?.size ?? 0, mimeType: f.mimeType };
    });

    await startServer(sessionToken, manifest, (id) => fileMap[id]);
    setLoading(false);
  };

  const handleCancel = () => {
    stopServer();
    useTransferStore.getState().clearSession();
    navigation.goBack();
  };

  const handleTransferStarted = () => {
    setSessionState('connected');
    (navigation as any).navigate('Transfer');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleCancel} style={styles.backButton}>
          <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ready to Send</Text>
        <View style={{ width: 40 }} />
      </View>

      {wifiWarning && (
        <View style={styles.wifiWarning}>
          <MaterialIcons name="wifi-off" size={18} color={Colors.warning} />
          <Text style={styles.wifiWarningText}>
            Not connected to WiFi. Both devices must be on the same network.
          </Text>
        </View>
      )}

      {/* QR Code */}
      <View style={styles.qrContainer}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" />
        ) : (
          <>
            <View style={styles.qrBox}>
              <QRCode
                value={qrValue}
                size={220}
                backgroundColor="white"
                color="#0A0A1A"
              />
            </View>
            <Text style={styles.qrInstruction}>
              Show this QR code to the receiving device
            </Text>
            <Text style={styles.qrSub}>
              The other device must tap <Text style={styles.bold}>Receive</Text> and scan this code
            </Text>
          </>
        )}
      </View>

      {/* Session info */}
      {!loading && (
        <View style={styles.sessionCard}>
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

      {/* Files summary */}
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

      <Text style={styles.hint}>
        💡 Keep this app open during the transfer for best performance.
        Large transfers may slow down if the app is backgrounded.
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
  hint: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
});
