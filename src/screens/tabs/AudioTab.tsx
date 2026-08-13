// src/screens/tabs/AudioTab.tsx
// List view of audio tracks with multi-select (Phase 4)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text,
  ActivityIndicator,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { Colors, Spacing, FontSize, BorderRadius } from '../../theme/colors';

const PAGE_SIZE = 50;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AudioTab() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toggleFile, isSelected, selectAll, clearSelection, selectedFiles } = useSelectionStore();

  const loadAudio = useCallback(async (cursor?: string) => {
    if (loading || (!hasMore && cursor)) return;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.audio,
        first: PAGE_SIZE,
        after: cursor,
        sortBy: MediaLibrary.SortBy.creationTime,
      });
      setAssets((prev) => cursor ? [...prev, ...result.assets] : result.assets);
      setEndCursor(result.endCursor);
      setHasMore(result.hasNextPage);
    } catch (err) {
      console.error('[Audio] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (permission?.granted) {
      loadAudio();
    }
  }, [permission?.granted]);

  if (!permission) return <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <PermissionGate
        iconName="library-music"
        title="Audio Library Access"
        description="SendApp needs access to your music library to let you share audio files with nearby devices."
        onRequest={requestPermission}
        denied={permission.canAskAgain === false}
      />
    );
  }

  const toSelectedFile = (asset: MediaLibrary.Asset): SelectedFile => ({
    id: asset.id,
    name: asset.filename,
    uri: asset.uri,
    size: 0,
    mimeType: 'audio/*',
    tab: 'Audio',
  });

  const handleLongPress = (asset: MediaLibrary.Asset) => toggleFile(toSelectedFile(asset));
  const handlePress = (asset: MediaLibrary.Asset) => {
    if (Object.keys(selectedFiles).length > 0) handleLongPress(asset);
  };
  const handleSelectAll = () => selectAll(assets.map(toSelectedFile));

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = isSelected(item.id);
    return (
      <TouchableOpacity
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[styles.row, selected && styles.rowSelected]}
        activeOpacity={0.8}
        accessibilityLabel={`Audio: ${item.filename}${selected ? ', selected' : ''}`}
        accessibilityRole="button"
      >
        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
          {selected
            ? <MaterialIcons name="check" size={22} color="white" />
            : <MaterialIcons name="audiotrack" size={22} color={Colors.primary} />
          }
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.filename.replace(/\.[^.]+$/, '')}</Text>
          <Text style={styles.meta}>{formatDuration(item.duration)} • Audio</Text>
        </View>
        {selected && <MaterialIcons name="check-circle" size={22} color={Colors.primary} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader tabName="Audio" onSelectAll={handleSelectAll} onClear={clearSelection} />
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={() => hasMore && loadAudio(endCursor)}
        onEndReachedThreshold={0.5}
        windowSize={10}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { paddingVertical: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  rowSelected: {
    backgroundColor: Colors.primaryGlow,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSelected: {
    backgroundColor: Colors.primary,
  },
  info: { flex: 1 },
  fileName: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  meta: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
