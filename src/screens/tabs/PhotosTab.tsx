// src/screens/tabs/PhotosTab.tsx
// Grid view of media library photos with multi-select (Phase 4)

import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { Colors, Spacing, BorderRadius } from '../../theme/colors';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const CELL_SIZE = (width - Spacing.sm * 2) / COLUMNS - 2;
const PAGE_SIZE = 60;

export default function PhotosTab() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toggleFile, isSelected, selectAll, clearSelection, selectedFiles } = useSelectionStore();

  const loadPhotos = useCallback(async (cursor?: string) => {
    if (loading || (!hasMore && cursor)) return;
    setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: MediaLibrary.MediaType.photo,
        first: PAGE_SIZE,
        after: cursor,
        sortBy: MediaLibrary.SortBy.creationTime,
      });
      setAssets((prev) => cursor ? [...prev, ...result.assets] : result.assets);
      setEndCursor(result.endCursor);
      setHasMore(result.hasNextPage);
    } catch (err) {
      console.error('[Photos] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore]);

  useEffect(() => {
    if (permission?.granted) {
      loadPhotos();
    }
  }, [permission?.granted]);

  if (!permission) return <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />;

  if (!permission.granted) {
    return (
      <PermissionGate
        iconName="photo-library"
        title="Photo Library Access"
        description="SendApp needs access to your photo library to let you choose photos and videos to share with nearby devices."
        onRequest={requestPermission}
        denied={permission.canAskAgain === false}
      />
    );
  }

  const handleLongPress = (asset: MediaLibrary.Asset) => {
    const file: SelectedFile = {
      id: asset.id,
      name: asset.filename,
      uri: asset.uri,
      size: 0, // MediaLibrary doesn't expose size directly; we get it at send time
      mimeType: 'image/*',
      tab: 'Photos',
      thumbnail: asset.uri,
    };
    toggleFile(file);
  };

  const handlePress = (asset: MediaLibrary.Asset) => {
    // Auto-select item on tap
    const file: SelectedFile = {
      id: asset.id,
      name: asset.filename,
      uri: asset.uri,
      size: 0,
      mimeType: 'image/*',
      tab: 'Photos',
      thumbnail: asset.uri,
    };
    toggleFile(file);
  };

  const handleSelectAll = () => {
    selectAll(
      assets.map((a) => ({
        id: a.id,
        name: a.filename,
        uri: a.uri,
        size: 0,
        mimeType: 'image/*',
        tab: 'Photos' as const,
        thumbnail: a.uri,
      }))
    );
  };

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = isSelected(item.id);
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        style={[styles.cell, selected && styles.cellSelected]}
        accessibilityLabel={`Photo: ${item.filename}${selected ? ', selected' : ''}`}
        accessibilityRole="imagebutton"
      >
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        {selected && (
          <View style={styles.checkOverlay}>
            <MaterialIcons name="check-circle" size={28} color={Colors.primary} />
          </View>
        )}
        {selected && <View style={styles.dimOverlay} />}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader
        tabName="Photos"
        onSelectAll={handleSelectAll}
        onClear={clearSelection}
      />
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) + 88 }]}
        onEndReached={() => hasMore && loadPhotos(endCursor)}
        onEndReachedThreshold={0.5}
        windowSize={5}
        getItemLayout={(_, index) => ({
          length: CELL_SIZE + 2,
          offset: (CELL_SIZE + 2) * Math.floor(index / COLUMNS),
          index,
        })}
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
    height: CELL_SIZE,
    margin: 1,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cellSelected: {
    borderWidth: 3,
    borderColor: Colors.primary,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  checkOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(108, 99, 255, 0.25)',
    zIndex: 1,
  },
});
