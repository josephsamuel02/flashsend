// src/screens/TransferScreen.tsx
// Android transfer screen — Xender-like progress, keep-awake, retry

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  AppState,
  Alert,
  Linking,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useTransferStore, TransferFile } from '../store/transferStore';
import { downloadAllFiles, PeerConnection, retryFile, uploadAllFiles } from '../networking/client';
import { stopServer, addFilesToManifest, updateFileProvider } from '../networking/server';
import * as SendappNative from 'sendapp-native';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';
import { stopHotspot } from 'flash-send-hotspot';
import { useSelectionStore } from '../store/selectionStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

function getFileIcon(mime: string, name: string): keyof typeof MaterialIcons.glyphMap {
  const n = name.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'videocam';
  if (mime.startsWith('audio/')) return 'audiotrack';
  if (n.endsWith('.apk')) return 'android';
  if (n.endsWith('.pdf')) return 'picture-as-pdf';
  if (mime.includes('zip')) return 'folder-zip';
  return 'insert-drive-file';
}

function FileRow({ file, peer, destDir }: { file: TransferFile; peer: PeerConnection | null; destDir: string }) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const progress = file.size > 0 ? Math.min(file.bytesTransferred / file.size, 1) : file.status === 'done' ? 1 : 0;
  const progressAnim = useRef(new Animated.Value(progress)).current;
  const { cancelFile, setFileStatus } = useTransferStore();

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const statusColor =
    file.status === 'done' ? C.success
    : file.status === 'error' ? C.error
    : file.status === 'cancelled' ? C.textMuted
    : file.status === 'active' ? C.primary
    : C.textMuted;

  const statusIcon =
    file.status === 'done' ? 'check-circle'
    : file.status === 'error' ? 'error'
    : file.status === 'cancelled' ? 'cancel'
    : file.direction === 'outgoing' ? 'arrow-upward' : 'arrow-downward';

  const handleRetry = async () => {
    if (!peer) return;
    setFileStatus(file.id, 'pending');
    // Need manifest entry shape
    await retryFile(peer, { id: file.id, name: file.name, size: file.size, mimeType: file.mimeType, checksum: file.checksum || '' }, destDir);
  };

  const handleOpen = async () => {
    if (!file.localUri) return;
    // For Android, try to open file or show in folder
    try {
      // If it's an APK, prompt install
      if (file.name.toLowerCase().endsWith('.apk')) {
        const contentUri = await FileSystem.getContentUriAsync(file.localUri as string);
        // Use Linking to open installer (USER needs to allow install unknown apps)
        Alert.alert('APK Ready', `${file.name} saved. Open to install?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Install', onPress: () => Linking.openURL(contentUri).catch(() => Alert.alert('Open manually', `File at ${file.localUri}`)) },
        ]);
      } else {
        Alert.alert('File saved', `Saved to:\n${file.localUri}`, [
          { text: 'OK' },
          { text: 'Open File', onPress: () => Linking.openURL(file.localUri as string).catch(() => {}) },
        ]);
      }
    } catch (e) {
      Alert.alert('Saved', file.localUri || '');
    }
  };

  return (
    <View style={styles.fileRow}>
      <View style={styles.fileRowHeader}>
        <View style={[styles.iconBox, { backgroundColor: statusColor + '18', borderColor: statusColor + '30' }]}>
          <MaterialIcons name={statusIcon} size={18} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.fileRowName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.fileRowSub} numberOfLines={1}>
            {file.direction === 'outgoing' ? 'Sending • ' : 'Receiving • '}{formatBytes(file.size)} • {file.mimeType.split('/').pop()}
          </Text>
        </View>
        <Text style={[styles.fileDirection, { color: file.direction === 'outgoing' ? C.primary : C.success }]}>
          {file.direction === 'outgoing' ? 'SEND' : 'RECV'}
        </Text>
        {(file.status === 'pending' || file.status === 'active') && (
          <TouchableOpacity
            onPress={() => cancelFile(file.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.cancelBtn}
          >
            <MaterialIcons name="close" size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.progressTrack}>
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: statusColor,
            },
          ]}
        />
      </View>

      <View style={styles.fileRowMeta}>
        <Text style={styles.metaText}>
          {formatBytes(file.bytesTransferred)} / {formatBytes(file.size)}
        </Text>
        {file.status === 'active' && <Text style={styles.speedText}>{formatSpeed(file.speed)} • {Math.round(progress * 100)}%</Text>}
        {file.status === 'pending' && <Text style={styles.statusText}>Waiting…</Text>}
        {file.status === 'done' && <Text style={[styles.statusText, { color: C.success }]}>Done ✓</Text>}
        {file.status === 'error' && <Text style={[styles.statusText, { color: C.error }]} numberOfLines={1}>{file.error?.slice(0, 60) || 'Failed'}</Text>}
        {file.status === 'cancelled' && <Text style={styles.statusText}>Cancelled</Text>}
        {!['active', 'pending'].includes(file.status) && <Text style={styles.metaText}>{Math.round(progress * 100)}%</Text>}
      </View>

      {file.status === 'error' && peer && file.direction === 'incoming' && (
        <TouchableOpacity onPress={handleRetry} style={styles.retryInline}>
          <MaterialIcons name="refresh" size={16} color={C.primary} />
          <Text style={styles.retryInlineText}>Retry</Text>
        </TouchableOpacity>
      )}

      {file.status === 'done' && (
        <TouchableOpacity onPress={handleOpen} style={styles.openInline}>
          <MaterialIcons name="open-in-new" size={14} color={C.primary} />
          <Text style={styles.openInlineText}>Open</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TransferScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const route = useRoute() as any;
  const insets = useSafeAreaInsets();
  const {
    files,
    totalBytes,
    bytesTransferred,
    sessionState,
    clearSession,
    archiveSession,
    addFiles,
  } = useTransferStore();

  const peer: PeerConnection | null = route.params?.peer ?? null;
  const manifestFiles = route.params?.files ?? null;
  const destDirRef = useRef<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSendMore, setShowSendMore] = useState(false);

  // Keep screen awake during transfer
  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    return () => { deactivateKeepAwake(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startDownload = async () => {
      if (peer && manifestFiles && !isDownloading) {
        setIsDownloading(true);
        // Base dir for FlashSend categorized saves — client will route per file to Images/Videos/Apps/Documents etc
        let destDir: string = FileSystem.documentDirectory + 'FlashSend/';
        try {
          const nativeBase = (SendappNative as any).getFlashSendBaseDir?.() as string | null;
          if (nativeBase) {
            const uri = nativeBase.startsWith('file://') ? nativeBase : `file://${nativeBase.replace(/\/+$/, '')}/`;
            destDir = uri;
          }
          // Ensure categorized subfolders exist even before downloads (native does it too)
          try {
            const ensure = (SendappNative as any).ensureFlashSendDirs as (() => Promise<Record<string,string>>) | undefined;
            if (ensure) await ensure();
          } catch {}
        } catch {}
        destDirRef.current = destDir;
        try {
          const info = await FileSystem.getInfoAsync(destDir);
          if (!info.exists) await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
          if (!cancelled) await downloadAllFiles(peer, manifestFiles, destDir);
        } catch (e) {
          console.error('[Transfer] downloadAllFiles error', e);
        } finally {
          if (!cancelled) setIsDownloading(false);
        }
      }
    };
    startDownload();

    const sub = AppState.addEventListener('change', (next) => {
      if (next.match(/inactive|background/)) {
        console.log('[Transfer] backgrounded');
      }
    });

    return () => {
      sub.remove();
      cancelled = true;
      if (Platform.OS === 'android') {
        try { stopHotspot(); } catch {}
        try {
          const WifiManager = require('react-native-wifi-reborn').default;
          (WifiManager as any).forceWifiUsageWithOptions?.(false, { noInternet: false });
        } catch {}
      }
      deactivateKeepAwake();
    };
  }, [peer, manifestFiles]);

  const allDone = files.length > 0 && files.every((f) => f.status === 'done' || f.status === 'cancelled' || f.status === 'error');
  const doneCount = files.filter((f) => f.status === 'done').length;
  const errorCount = files.filter((f) => f.status === 'error').length;
  const outgoingCount = files.filter((f) => f.direction === 'outgoing').length;
  const incomingCount = files.filter((f) => f.direction === 'incoming').length;
  const overallProgress = totalBytes > 0 ? Math.min(bytesTransferred / totalBytes, 1) : files.length === 0 ? 0 : doneCount / Math.max(files.length, 1);
  const isSender = !peer || outgoingCount > 0 && incomingCount === 0;

  const handleDone = () => {
    stopServer();
    if (Platform.OS === 'android') {
      try { stopHotspot(); } catch {}
      try {
        const WifiManager = require('react-native-wifi-reborn').default;
        (WifiManager as any).forceWifiUsageWithOptions?.(false, { noInternet: false });
      } catch {}
    }
    // Archive to history before clearing
    if (doneCount > 0) archiveSession();
    else clearSession();
    navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
  };

  const handleCancelAll = () => {
    Alert.alert('Cancel all?', 'Stop all remaining transfers?', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'Cancel All',
        style: 'destructive',
        onPress: () => {
          files.forEach((f) => {
            if (f.status === 'pending' || f.status === 'active') useTransferStore.getState().cancelFile(f.id);
          });
        },
      },
    ]);
  };

  const handleSendMoreFiles = () => {
    if (!peer) {
      Alert.alert('No Connection', 'Cannot send files - no peer connection available.');
      return;
    }

    Alert.alert(
      'Send More Files',
      'Go back to the home screen to select additional files, then tap Send to transfer them to the connected device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Select Files',
          onPress: () => {
            navigation.navigate('Tabs');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <MaterialIcons name="arrow-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{isSender ? 'Sending' : 'Receiving'}</Text>
          <Text style={styles.headerSub}>{files.length} files • {formatBytes(totalBytes)}</Text>
        </View>
        {sessionState !== 'idle' && (
          <View style={[styles.activeBadge, allDone && styles.activeBadgeDone]}>
            <View style={[styles.activeDot, allDone && { backgroundColor: C.success }]} />
            <Text style={[styles.activeBadgeText, allDone && { color: C.success }]}>{allDone ? 'Done' : 'Live'}</Text>
          </View>
        )}
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{allDone ? 'Completed' : 'Transferring'}</Text>
          <Text style={styles.summaryValue}>{Math.round(overallProgress * 100)}%</Text>
        </View>
        <View style={styles.progressTrackLarge}>
          <View style={[styles.progressFillLarge, { width: `${overallProgress * 100}%`, backgroundColor: errorCount > 0 && doneCount === 0 ? C.error : C.primary }]} />
        </View>
        <View style={styles.summaryStats}>
          <Text style={styles.statText}>{formatBytes(bytesTransferred)} / {formatBytes(totalBytes)}</Text>
          <Text style={styles.statText}>{doneCount}/{files.length} • {errorCount > 0 ? `${errorCount} failed` : 'All good'}</Text>
        </View>
      </View>

      {files.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialIcons name="inbox" size={56} color={C.surfaceBorder} />
          <Text style={styles.emptyTitle}>No active transfer</Text>
          <Text style={styles.emptySub}>Start from Send or Receive.</Text>
          <TouchableOpacity onPress={handleDone} style={styles.doneButtonEmpty}>
            <Text style={styles.doneButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <FileRow file={item} peer={peer} destDir={destDirRef.current} />}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            files.length > 3 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listHeaderText}>{incomingCount > 0 ? `${incomingCount} incoming • ${outgoingCount} outgoing` : `${files.length} files hosted`}</Text>
                {!allDone && (
                  <TouchableOpacity onPress={handleCancelAll}>
                    <Text style={styles.listHeaderCancel}>Cancel All</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
        />
      )}

      {files.length > 0 && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          {allDone ? (
            <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
              <MaterialIcons name="check" size={22} color="white" />
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Floating action button to send more files - only show if peer connected */}
      {peer && sessionState === 'connected' && (
        <TouchableOpacity
          style={[styles.fabButton, { bottom: Math.max(insets.bottom, 16) + 88 }]}
          onPress={handleSendMoreFiles}
        >
          <MaterialIcons name="add" size={28} color="white" />
          <Text style={styles.fabText}>Send More</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'android' ? Spacing.lg + 8 : 60,
    paddingBottom: Spacing.md,
    backgroundColor: C.surface,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
    elevation: 2,
  },
  headerBack: { padding: 8, marginLeft: -4, borderRadius: 20, backgroundColor: C.surfaceElevated },
  headerTitle: { fontSize: 18, fontWeight: '800', color: C.textPrimary, fontFamily: FontFamily.bold },
  headerSub: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(65, 105, 225, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: C.primary,
  },
  activeBadgeDone: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: C.success },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  activeBadgeText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  summary: {
    backgroundColor: C.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: C.textSecondary, fontSize: 13, fontWeight: '600' },
  summaryValue: { color: C.textPrimary, fontWeight: '800', fontSize: 18 },
  progressTrackLarge: { height: 10, backgroundColor: C.surfaceBorder, borderRadius: BorderRadius.round, overflow: 'hidden' },
  progressFillLarge: { height: '100%', borderRadius: BorderRadius.round },
  summaryStats: { flexDirection: 'row', justifyContent: 'space-between' },
  statText: { color: C.textMuted, fontSize: 12, fontFamily: FontFamily.medium },
  list: { padding: Spacing.md, paddingBottom: 120, gap: 8 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listHeaderText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  listHeaderCancel: { color: C.error, fontSize: 12, fontWeight: '700' },
  fileRow: {
    backgroundColor: C.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    elevation: 1,
  },
  fileRowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBox: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  fileRowName: { color: C.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  fileRowSub: { color: C.textMuted, fontSize: 11, marginTop: 1 },
  fileDirection: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cancelBtn: { padding: 4, backgroundColor: C.surfaceElevated, borderRadius: 12 },
  progressTrack: { height: 6, backgroundColor: C.surfaceBorder, borderRadius: BorderRadius.round, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: BorderRadius.round },
  fileRowMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  metaText: { color: C.textMuted, fontSize: 11, fontFamily: FontFamily.medium },
  speedText: { color: C.primary, fontSize: 11, fontWeight: '700' },
  statusText: { fontSize: 11, fontWeight: '600' },
  retryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.primaryGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: C.primary,
  },
  retryInlineText: { color: C.primary, fontWeight: '700', fontSize: 13 },
  openInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: C.surfaceElevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  openInlineText: { color: C.primary, fontWeight: '600', fontSize: 13 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.textSecondary },
  emptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
  doneButtonEmpty: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: BorderRadius.round, marginTop: 8 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.surfaceBorder,
    elevation: 8,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: C.success,
    paddingVertical: 14,
    borderRadius: BorderRadius.round,
    elevation: 2,
  },
  doneButtonText: { color: 'white', fontWeight: '800', fontSize: 16 },
  fabButton: {
    position: 'absolute',
    bottom: 100,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.round,
    elevation: 6,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
