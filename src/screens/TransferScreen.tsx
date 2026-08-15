// src/screens/TransferScreen.tsx
// Active transfer UI — shows all file rows with progress (Phase 7)

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

import { useTransferStore, TransferFile } from '../store/transferStore';
import { downloadAllFiles, PeerConnection } from '../networking/client';
import { stopServer } from '../networking/server';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';
import { stopHotspot } from 'flash-send-hotspot';
import { AppState, Platform } from 'react-native';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function FileRow({ file }: { file: TransferFile }) {
  const progress = file.size > 0 ? file.bytesTransferred / file.size : 0;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  const { cancelFile } = useTransferStore();

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const statusColor =
    file.status === 'done' ? Colors.success
    : file.status === 'error' ? Colors.error
    : file.status === 'cancelled' ? Colors.textMuted
    : Colors.primary;

  const statusIcon =
    file.status === 'done' ? 'check-circle'
    : file.status === 'error' ? 'error'
    : file.status === 'cancelled' ? 'cancel'
    : file.direction === 'outgoing' ? 'arrow-upward' : 'arrow-downward';

  return (
    <View style={styles.fileRow}>
      <View style={styles.fileRowHeader}>
        <MaterialIcons name={statusIcon} size={20} color={statusColor} />
        <Text style={styles.fileRowName} numberOfLines={1}>{file.name}</Text>
        <Text style={[styles.fileDirection,
          { color: file.direction === 'outgoing' ? Colors.primary : Colors.success }
        ]}>
          {file.direction === 'outgoing' ? '↑ OUT' : '↓ IN'}
        </Text>
        {(file.status === 'pending' || file.status === 'active') && (
          <TouchableOpacity
            onPress={() => cancelFile(file.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="close" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      <View style={styles.fileRowMeta}>
        <Text style={styles.metaText}>
          {formatBytes(file.bytesTransferred)} / {formatBytes(file.size)}
        </Text>
        {file.status === 'active' && (
          <Text style={styles.speedText}>{formatSpeed(file.speed)}</Text>
        )}
        {file.status === 'done' && (
          <Text style={[styles.statusText, { color: Colors.success }]}>Complete ✓</Text>
        )}
        {file.status === 'error' && (
          <Text style={[styles.statusText, { color: Colors.error }]} numberOfLines={1}>
            {file.error || 'Failed'}
          </Text>
        )}
        <Text style={styles.metaText}>{Math.round(progress * 100)}%</Text>
      </View>
    </View>
  );
}

export default function TransferScreen() {
  const navigation = useNavigation();
  const route = useRoute() as any;
  const {
    files,
    totalBytes,
    bytesTransferred,
    sessionState,
    clearSession,
    session,
  } = useTransferStore();

  const peer: PeerConnection | null = route.params?.peer ?? null;
  const manifestFiles = route.params?.files ?? null;

  useEffect(() => {
    // If this is a receive session, start downloading
    if (peer && manifestFiles) {
      const destDir = FileSystem.documentDirectory + 'SendApp/received/';
      FileSystem.makeDirectoryAsync(destDir, { intermediates: true })
        .then(() => downloadAllFiles(peer, manifestFiles, destDir))
        .catch(console.error);
    }
    // Phase 5: AppState listener — hotspot is tied to app lifecycle
    const sub = AppState.addEventListener('change', (next) => {
      if (next.match(/inactive|background/)) {
        console.log('[Transfer] App backgrounded with active transfer');
      }
    });
    return () => {
      sub.remove();
      // Clean up hotspot on unmount if still active (Android sender case)
      if (Platform.OS === 'android') {
        try { stopHotspot(); } catch {}
      }
    };
  }, []);

  const allDone = files.every((f) => f.status === 'done' || f.status === 'cancelled' || f.status === 'error');
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const overallProgress = totalBytes > 0 ? bytesTransferred / totalBytes : 0;

  const handleDone = () => {
    stopServer();
    if (Platform.OS === 'android') {
      try { stopHotspot(); } catch {}
      // Release scoped WiFi bind if we forced it on receiver
      try {
        const WifiManager = require('react-native-wifi-reborn').default;
        (WifiManager as any).forceWifiUsageWithOptions?.(false, { noInternet: false });
      } catch {}
    }
    clearSession();
    (navigation as any).navigate('Main');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transfer Active</Text>
        {sessionState !== 'idle' && (
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBadgeText}>Live</Text>
          </View>
        )}
      </View>

      {/* Summary banner */}
      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Overall Progress</Text>
          <Text style={styles.summaryValue}>{Math.round(overallProgress * 100)}%</Text>
        </View>
        <View style={styles.progressTrackLarge}>
          <View
            style={[
              styles.progressFillLarge,
              { width: `${overallProgress * 100}%` },
            ]}
          />
        </View>
        <View style={styles.summaryStats}>
          <Text style={styles.statText}>
            {formatBytes(bytesTransferred)} / {formatBytes(totalBytes)}
          </Text>
          <Text style={styles.statText}>
            {doneCount}/{files.length} files
          </Text>
        </View>

        {errorCount > 0 && (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error" size={16} color={Colors.error} />
            <Text style={styles.errorBannerText}>{errorCount} file(s) failed</Text>
          </View>
        )}
      </View>

      {/* File list */}
      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FileRow file={item} />}
        contentContainerStyle={styles.list}
      />

      {/* Done button */}
      {allDone && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
            <MaterialIcons name="check" size={22} color={'white'} />
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Background warning */}
      {!allDone && (
        <View style={styles.bgWarning}>
          <MaterialIcons name="info-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.bgWarningText}>
            Keep this screen open for best transfer performance
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 60 : Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
    gap: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(0, 212, 170, 0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  activeBadgeText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: '700' },
  summary: {
    backgroundColor: Colors.surfaceElevated,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: Colors.textSecondary, fontSize: FontSize.sm },
  summaryValue: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.lg },
  progressTrackLarge: {
    height: 8,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: BorderRadius.round,
  },
  progressFillLarge: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.round,
  },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-between' },
  statText: { color: Colors.textMuted, fontSize: FontSize.xs },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,71,87,0.15)',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  errorBannerText: { color: Colors.error, fontSize: FontSize.sm },
  list: { padding: Spacing.md, paddingBottom: 120 },
  fileRow: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  fileRowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  fileRowName: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: '600' },
  fileDirection: { fontSize: FontSize.xs, fontWeight: '700' },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.surfaceBorder,
    borderRadius: BorderRadius.round,
  },
  progressFill: {
    height: '100%',
    borderRadius: BorderRadius.round,
  },
  fileRowMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: Colors.textMuted, fontSize: FontSize.xs },
  speedText: { color: Colors.primaryLight, fontSize: FontSize.xs, fontWeight: '600' },
  statusText: { fontSize: FontSize.xs, fontWeight: '600' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.lg,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
  },
  doneButtonText: { color: 'white', fontWeight: '700', fontSize: FontSize.lg },
  bgWarning: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  bgWarningText: { flex: 1, color: Colors.textMuted, fontSize: FontSize.xs },
});
