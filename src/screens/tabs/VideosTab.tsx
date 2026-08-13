// src/screens/tabs/VideosTab.tsx
// Grid view of videos with duration overlay and multi-select (Phase 4)

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Text,
  ActivityIndicator,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { Colors, Spacing, BorderRadius, FontSize } from '../../theme/colors';

const { width } = Dimensions.get('window');
const COLUMNS = 2;
const CELL_SIZE = (width - Spacing.sm * 2) / COLUMNS - 2;
const PAGE_SIZE = 30;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideosTab() {
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toggleFile, isSelected, selectAll, clearSelection, selectedFiles } = useSelectionStore();

  const loadVideos = useCallback(async (cursor?: string) => {
    if (loading || (!hasMore && cursor)) return;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.video,
        first: PAGE_SIZE,
        after: cursor,
        sortBy: MediaLibrary.SortBy.creationTime,
      });
      setAssets((prev) => cursor ? [...prev, ...result.assets] : result.assets);
      setEndCursor(result.endCursor);
      setHasMore(result.hasNextPage);
    } catch (err) {
      console.error('[Videos] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (permission?.granted) {
      loadVideos();
    }
  }, [permission?.granted]);

  if (!permission) return <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <PermissionGate
        iconName="video-library"
        title="Video Library Access"
        description="SendApp needs access to your video library to let you share videos with nearby devices."
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
    mimeType: 'video/*',
    tab: 'Videos',
    thumbnail: asset.uri,
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
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[styles.cell, selected && styles.cellSelected]}
        accessibilityLabel={`Video: ${item.filename}${selected ? ', selected' : ''}`}
        accessibilityRole="imagebutton"
      >
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        <View style={styles.durationBadge}>
          <MaterialIcons name="play-arrow" size={12} color="white" />
          <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
        </View>
        {selected && <View style={styles.checkOverlay}>
          <MaterialIcons name="check-circle" size={32} color={Colors.primary} />
        </View>}
        {selected && <View style={styles.dimOverlay} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader tabName="Videos" onSelectAll={handleSelectAll} onClear={clearSelection} />
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={styles.grid}
        onEndReached={() => hasMore && loadVideos(endCursor)}
        onEndReachedThreshold={0.5}
        windowSize={5}
        ListFooterComponent={loading ? <ActivityIndicator color={Colors.primary} style={{ padding: 20 }} /> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  grid: { padding: Spacing.sm },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE * 0.65,
    margin: 1,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cellSelected: { borderWidth: 3, borderColor: Colors.primary },
  thumbnail: { width: '100%', height: '100%' },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  durationText: { color: 'white', fontSize: FontSize.xs, fontWeight: '600' },
  checkOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    zIndex: 1,
  },
});
