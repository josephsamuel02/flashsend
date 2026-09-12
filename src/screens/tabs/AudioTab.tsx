// src/screens/tabs/AudioTab.tsx
// Android-optimized audio list, Xender-like

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius } from '../../theme/colors';

const PAGE_SIZE = 60;

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioTab() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  const hasNextRef = useRef(true);

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const toggleFile = useSelectionStore((s) => s.toggleFile);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const loadAssets = useCallback(async (cursor?: string, isRefresh = false) => {
    if (loadingRef.current) return;
    if (!isRefresh && !hasNextRef.current && cursor) return;
    loadingRef.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: 'audio',
        first: PAGE_SIZE,
        after: cursor,
        sortBy: ['creationTime'],
      });
      if (isRefresh || !cursor) setAssets(result.assets);
      else setAssets((prev) => [...prev, ...result.assets]);
      setEndCursor(result.endCursor);
      setHasNextPage(result.hasNextPage);
      hasNextRef.current = result.hasNextPage;
    } catch (err) {
      console.error('[Audio] load failed:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (permission?.granted) {
      hasNextRef.current = true;
      loadAssets(undefined, true);
    }
  }, [permission?.granted, loadAssets]);

  // Auto-refresh each time the tab gains focus (pull-to-refresh remains for manual)
  useFocusEffect(
    useCallback(() => {
      if (permission?.granted && useSettingsStore.getState().autoRefresh) {
        hasNextRef.current = true;
        loadAssets(undefined, true);
      }
    }, [permission?.granted, loadAssets])
  );

  if (!permission) return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (!permission.granted) {
    return (
      <PermissionGate
        iconName="library-music"
        title="Allow Music Access"
        description="Access audio files to share music instantly with nearby Android devices."
        onRequest={requestPermission}
        denied={permission.canAskAgain === false}
      />
    );
  }

  const toSelected = (a: MediaLibrary.Asset): SelectedFile => ({
    id: a.id,
    name: a.filename,
    uri: a.uri,
    size: 0,
    mimeType: 'audio/*',
    tab: 'Audio',
  });

  const handleToggle = (a: MediaLibrary.Asset) => toggleFile(toSelected(a));

  const handlePlayPause = useCallback(
    (a: MediaLibrary.Asset) => {
      try {
        if (playingId === a.id && status.playing) {
          player.pause();
        } else if (playingId === a.id) {
          player.play();
        } else {
          setPlayingId(a.id);
          player.replace({ uri: a.uri });
          player.play();
        }
      } catch (err) {
        console.warn('[Audio] playback failed:', err);
      }
    },
    [playingId, status.playing, player]
  );

  // Stop playback when leaving the tab
  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = !!selectedFiles[item.id];
    const isPlaying = playingId === item.id && status.playing;
    return (
      <TouchableOpacity
        onPress={() => handleToggle(item)}
        style={[styles.row, selected && styles.rowSelected]}
        activeOpacity={0.85}
      >
        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
          {selected ? (
            <MaterialIcons name="check" size={22} color="white" />
          ) : (
            <MaterialIcons name="audiotrack" size={22} color={C.primary} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.filename.replace(/\.[^.]+$/, '')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatDuration(item.duration)} • {item.filename.split('.').pop()?.toUpperCase()}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handlePlayPause(item)}
          style={[styles.playBtn, isPlaying && styles.playBtnActive]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
        >
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={24} color={isPlaying ? 'white' : C.primary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader tabName="Audio" onClear={clearSelection} />
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          assets.length === 0 && !loading ? { flexGrow: 1 } : undefined,
        ]}
        onEndReached={() => hasNextPage && !loadingRef.current && loadAssets(endCursor)}
        onEndReachedThreshold={0.4}
        windowSize={10}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { hasNextRef.current = true; loadAssets(undefined, true); }} colors={[C.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <MaterialIcons name="library-music" size={64} color={C.surfaceBorder} />
              <Text style={styles.emptyTitle}>No audio found</Text>
              <Text style={styles.emptySub}>Music and recordings will appear here.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && assets.length > 0 ? <ActivityIndicator color={C.primary} style={{ padding: 16 }} /> : null
        }
      />
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
  list: { paddingVertical: Spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
    backgroundColor: C.background,
  },
  rowSelected: { backgroundColor: C.primaryGlow },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  iconBoxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  playBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  info: { flex: 1 },
  fileName: { color: C.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  meta: { color: C.textSecondary, fontSize: FontSize.sm, marginTop: 2 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    marginTop: 40,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: C.textSecondary },
  emptySub: { fontSize: FontSize.md, color: C.textMuted, textAlign: 'center' },
});
