// src/screens/tabs/PhotosTab.tsx
// Android-optimized photo grid with Xender-like selection

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
  RefreshControl,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { Colors, Spacing, BorderRadius, FontSize } from '../../theme/colors';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 2;
const H_PAD = Spacing.sm;
const CELL_SIZE = (width - H_PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const PAGE_SIZE = 80;

export default function PhotosTab() {
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
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const loadAssets = useCallback(async (cursor?: string, isRefresh = false) => {
    if (loadingRef.current) return;
    if (!isRefresh && !hasNextRef.current && cursor) return;
    loadingRef.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        mediaType: 'photo',
        first: PAGE_SIZE,
        after: cursor,
        sortBy: ['creationTime'],
      });
      if (isRefresh || !cursor) {
        setAssets(result.assets);
      } else {
        setAssets((prev) => [...prev, ...result.assets]);
      }
      setEndCursor(result.endCursor);
      setHasNextPage(result.hasNextPage);
      hasNextRef.current = result.hasNextPage;
    } catch (err) {
      console.error('[Photos] load failed:', err);
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

  const handleRefresh = useCallback(() => {
    hasNextRef.current = true;
    loadAssets(undefined, true);
  }, [loadAssets]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <PermissionGate
        iconName="photo-library"
        title="Allow Photo Access"
        description="Flash Send needs access to photos to let you pick and share them instantly with nearby Android devices. No photos are uploaded to the cloud."
        onRequest={requestPermission}
        denied={permission.canAskAgain === false}
      />
    );
  }

  const toSelected = (asset: MediaLibrary.Asset): SelectedFile => ({
    id: asset.id,
    name: asset.filename,
    uri: asset.uri,
    size: 0,
    mimeType: 'image/*',
    tab: 'Photos',
    thumbnail: asset.uri,
  });

  const handleToggle = (asset: MediaLibrary.Asset) => toggleFile(toSelected(asset));

  const handleSelectAll = () => {
    selectAll(assets.map(toSelected));
  };

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = !!selectedFiles[item.id];
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => handleToggle(item)}
        style={[styles.cell, selected && styles.cellSelected]}
      >
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
        {selected && <View style={styles.dimOverlay} />}
        {selected && (
          <View style={styles.checkOverlay}>
            <View style={styles.checkCircle}>
              <MaterialIcons name="check" size={18} color="white" />
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader tabName="Photos" onSelectAll={handleSelectAll} onClear={clearSelection} />
      <FlatList
        data={assets}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: Math.max(insets.bottom, 16) + 96 },
          assets.length === 0 && !loading ? styles.gridEmpty : undefined,
        ]}
        columnWrapperStyle={assets.length > 0 ? styles.columnWrapper : undefined}
        onEndReached={() => {
          if (hasNextPage && !loadingRef.current) loadAssets(endCursor);
        }}
        onEndReachedThreshold={0.4}
        windowSize={7}
        initialNumToRender={30}
        maxToRenderPerBatch={30}
        removeClippedSubviews
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <MaterialIcons name="photo-library" size={64} color={Colors.surfaceBorder} />
              <Text style={styles.emptyTitle}>No photos found</Text>
              <Text style={styles.emptySub}>Photos you take will appear here. Pull to refresh.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && assets.length > 0 ? (
            <ActivityIndicator color={Colors.primary} style={{ padding: 16 }} />
          ) : !hasNextPage && assets.length > 0 ? (
            <Text style={styles.footerEnd}>{assets.length} photos</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  grid: { paddingHorizontal: H_PAD, paddingTop: H_PAD },
  gridEmpty: { flexGrow: 1 },
  columnWrapper: { gap: GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginBottom: GAP,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceElevated,
  },
  cellSelected: {
    borderWidth: 2.5,
    borderColor: Colors.primary,
  },
  thumbnail: { width: '100%', height: '100%' },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(65, 105, 225, 0.28)',
  },
  checkOverlay: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 2,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    elevation: 3,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    marginTop: 60,
  },
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textSecondary },
  emptySub: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
  footerEnd: { textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.xs, padding: 12 },
});
