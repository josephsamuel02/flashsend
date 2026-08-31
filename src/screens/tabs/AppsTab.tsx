// src/screens/tabs/AppsTab.tsx
// Android app grid - Xender-like APK sharing

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { getInstalledApps } from 'sendapp-native';
import * as SendappNative from 'sendapp-native';
const getApkSize = (SendappNative as any).getApkSize as (pkg: string) => number;

interface InstalledApp {
  name: string;
  packageName: string;
  icon?: number;
  iconBase64?: string | null;
}

interface AppWithSelection extends InstalledApp {
  id: string;
}

const { width } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const H_GAP = 8;
const CONTAINER_PAD = 12;
const ITEM_WIDTH = (width - CONTAINER_PAD * 2 - H_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

function formatApkSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppsTab() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppWithSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const toggleFile = useSelectionStore((s) => s.toggleFile);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const loadInstalledApps = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const installedApps: InstalledApp[] = await getInstalledApps();

      if (!installedApps || installedApps.length === 0) {
        setError(
          'No apps found. Ensure app has QUERY_ALL_PACKAGES and <queries> for LAUNCHER. Rebuild: npx expo prebuild --clean && npx expo run:android'
        );
        setApps([]);
        return;
      }

      const appsWithIds: AppWithSelection[] = installedApps
        .map((app) => ({
          ...app,
          id: app.packageName,
        }))
        .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

      setApps(appsWithIds);
    } catch (err: any) {
      console.error('[Apps] load failed:', err);
      const msg = err?.message || 'Failed to load apps';
      const hint = msg.includes('Native module') || msg.includes('not available')
        ? ' Native module not linked — rebuild dev-client with npx expo run:android. Expo Go will not work.'
        : '';
      setError(msg + hint);
      setApps([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInstalledApps();
  }, [loadInstalledApps]);

  const filteredApps = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter((a) => a.name.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q));
  }, [apps, search]);

  const handleSelectApp = useCallback((app: AppWithSelection) => {
    const apkSize = getApkSize(app.packageName) || 0;
    const file: SelectedFile = {
      id: app.id,
      name: `${app.name}.apk`,
      uri: app.packageName, // HostScreen will resolve to actual APK path via copyApkToCache
      size: apkSize,
      mimeType: 'application/vnd.android.package-archive',
      tab: 'Apps' as const,
    };
    toggleFile(file);
  }, [toggleFile]);

  const handleSelectAll = useCallback(() => {
    const files: SelectedFile[] = filteredApps.map((app) => ({
      id: app.id,
      name: `${app.name}.apk`,
      uri: app.packageName,
      size: getApkSize(app.packageName) || 0,
      mimeType: 'application/vnd.android.package-archive',
      tab: 'Apps' as const,
    }));
    selectAll(files);
  }, [filteredApps, selectAll]);

  const handleDeselectAll = useCallback(() => {
    // Deselect only filtered (visible) apps if searching, otherwise clear all Apps
    if (search.trim()) {
      const ids = new Set(filteredApps.map(a => a.id));
      // Use clearSelection if no search, else deselectAll via store
      const deselectAll = useSelectionStore.getState().deselectAll;
      const files: SelectedFile[] = filteredApps.map((app) => ({
        id: app.id,
        name: `${app.name}.apk`,
        uri: app.packageName,
        size: 0,
        mimeType: 'application/vnd.android.package-archive',
        tab: 'Apps' as const,
      }));
      deselectAll(files);
    } else {
      // Clear only Apps tab
      useSelectionStore.getState().clearTab('Apps');
    }
  }, [filteredApps, search]);

  const renderAppItem = useCallback(({ item }: { item: AppWithSelection }) => {
    const selected = !!selectedFiles[item.id];
    const hasRealIcon = !!item.iconBase64;

    return (
      <TouchableOpacity
        onPress={() => handleSelectApp(item)}
        style={[styles.gridItem, selected && styles.gridItemSelected]}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrap}>
          {hasRealIcon ? (
            <Image
              source={{ uri: `data:image/png;base64,${item.iconBase64}` }}
              style={styles.appIcon}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.fallbackIcon}>
              <MaterialIcons name="apps" size={28} color={Colors.primary} />
            </View>
          )}
          {selected && (
            <View style={styles.checkBadge}>
              <MaterialIcons name="check" size={14} color="white" />
            </View>
          )}
        </View>
        <Text style={styles.appNameGrid} numberOfLines={2}>
          {item.name}
        </Text>
        {getApkSize(item.packageName) > 0 && (
          <Text style={styles.apkSize} numberOfLines={1}>
            {formatApkSize(getApkSize(item.packageName))}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [selectedFiles, handleSelectApp]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading apps…</Text>
        <Text style={styles.loadingSub}>Reading installed packages</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search + actions */}
      <View style={styles.header}>
        <View style={styles.searchWrap}>
          <MaterialIcons name="search" size={20} color={Colors.textMuted} />
          <TextInput
            placeholder="Search apps"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleSelectAll} style={styles.actionButton}>
          <MaterialIcons name="select-all" size={16} color={Colors.primary} />
          <Text style={styles.actionText}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDeselectAll} style={[styles.actionButton, styles.actionButtonClear]}>
          <MaterialIcons name="clear" size={16} color={Colors.textSecondary} />
          <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.countBar}>
        <Text style={styles.countText}>
          {filteredApps.length} apps{search ? ` (filtered)` : ''} • {Object.values(selectedFiles).filter(f => f.tab === 'Apps').length} selected
        </Text>
        <TouchableOpacity onPress={() => loadInstalledApps(true)} style={styles.refreshBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="refresh" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="warning-amber" size={20} color={Colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filteredApps}
        keyExtractor={(item) => item.id}
        renderItem={renderAppItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) + 108 }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={21}
        windowSize={7}
        maxToRenderPerBatch={21}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadInstalledApps(true)} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="apps" size={64} color={Colors.surfaceBorder} />
            <Text style={styles.emptyTitle}>{search ? 'No matches' : 'No Apps Found'}</Text>
            <Text style={styles.emptySubtitle}>
              {search ? `No apps match "${search}"` : 'Unable to load apps. Pull to refresh.'}
            </Text>
            {!search && (
              <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.retryButtonLarge}>
                <MaterialIcons name="refresh" size={18} color="white" />
                <Text style={styles.retryTextLarge}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    gap: 8,
  },
  loadingText: { color: Colors.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, marginTop: 8 },
  loadingSub: { color: Colors.textMuted, fontSize: FontSize.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.round,
    paddingHorizontal: 12,
    height: 36,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 0 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: BorderRadius.round,
    backgroundColor: Colors.primaryGlow,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  actionButtonClear: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.surfaceBorder,
  },
  actionText: { fontSize: 12, fontFamily: FontFamily.semiBold, color: Colors.primary },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.background,
  },
  countText: { fontSize: 12, color: Colors.textMuted, fontFamily: FontFamily.medium },
  refreshBtn: { padding: 4 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    margin: 8,
    borderRadius: BorderRadius.md,
  },
  errorText: { flex: 1, color: Colors.warning, fontSize: 13 },
  retryButton: { backgroundColor: Colors.warning, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.sm },
  retryText: { color: 'white', fontSize: 12, fontFamily: FontFamily.bold },
  retryButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  retryTextLarge: { color: 'white', fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  grid: { paddingHorizontal: CONTAINER_PAD, paddingTop: 8 },
  columnWrapper: { gap: H_GAP, marginBottom: H_GAP },
  gridItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.2,
    borderColor: Colors.surfaceBorder,
    gap: 6,
    elevation: 1,
  },
  gridItemSelected: { backgroundColor: Colors.primaryGlow, borderColor: Colors.primary, elevation: 2 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: { width: 56, height: 56, borderRadius: 14 },
  fallbackIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    elevation: 2,
  },
  appNameGrid: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
    minHeight: 30,
  },
  apkSize: { fontSize: 10, color: Colors.textMuted, fontFamily: FontFamily.regular },
  emptyContainer: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
    marginTop: 20,
  },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: Colors.textSecondary },
  emptySubtitle: { fontSize: FontSize.md, color: Colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
