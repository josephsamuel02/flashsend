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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import SelectionHeader from '../../components/SelectionHeader';
import PermissionGate from '../../components/PermissionGate';
import { useColors, type ThemeColors, Spacing, BorderRadius, FontSize } from '../../theme/colors';
import type { ViewerAsset } from '../MediaViewerScreen';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 4;
const H_PAD = 4;
const CELL_SIZE = (width - H_PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const PAGE_SIZE = 80;

export default function PhotosTab() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
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

  // Auto-refresh each time the tab gains focus (pull-to-refresh remains for manual)
  useFocusEffect(
    useCallback(() => {
      if (permission?.granted && useSettingsStore.getState().autoRefresh) {
        hasNextRef.current = true;
        loadAssets(undefined, true);
      }
    }, [permission?.granted, loadAssets])
  );

  const handleRefresh = useCallback(() => {
    hasNextRef.current = true;
    loadAssets(undefined, true);
  }, [loadAssets]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.primary} size="large" />
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

  const openViewer = useCallback(
    (asset: MediaLibrary.Asset) => {
      const viewerAssets: ViewerAsset[] = assets.map((a) => ({
        id: a.id,
        uri: a.uri,
        name: a.filename,
        size: 0,
        mimeType: 'image/*',
      }));
      const initialIndex = Math.max(
        0,
        assets.findIndex((a) => a.id === asset.id)
      );
      navigation.navigate('MediaViewer', { assets: viewerAssets, initialIndex });
    },
    [assets, navigation]
  );

  const renderItem = ({ item }: { item: MediaLibrary.Asset }) => {
    const selected = !!selectedFiles[item.id];
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => openViewer(item)}
        onLongPress={() => handleToggle(item)}
        delayLongPress={350}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <MaterialIcons name="photo-library" size={64} color={C.surfaceBorder} />
              <Text style={styles.emptyTitle}>No photos found</Text>
              <Text style={styles.emptySub}>Photos you take will appear here. Pull to refresh.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          loading && assets.length > 0 ? (
            <ActivityIndicator color={C.primary} style={{ padding: 16 }} />
          ) : null
        }
      />
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
  grid: { paddingHorizontal: H_PAD, paddingTop: H_PAD },
  gridEmpty: { flexGrow: 1 },
  columnWrapper: { gap: GAP },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    marginBottom: GAP,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    backgroundColor: C.surfaceElevated,
  },
  cellSelected: {
    borderWidth: 2.5,
    borderColor: C.primary,
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
    backgroundColor: C.primary,
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
  emptyTitle: { fontSize: FontSize.xl, fontWeight: '700', color: C.textSecondary },
  emptySub: { fontSize: FontSize.md, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
});
