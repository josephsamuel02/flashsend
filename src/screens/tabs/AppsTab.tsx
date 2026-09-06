// src/screens/tabs/AppsTab.tsx
// Android app grid - Xender-like APK sharing - with User Apps + System Apps sections

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
import { useFocusEffect } from '@react-navigation/native';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getInstalledApps } from 'sendapp-native';
import * as SendappNative from 'sendapp-native';
const getApkSize = (SendappNative as any).getApkSize as (pkg: string) => number;

interface InstalledApp {
  name: string;
  packageName: string;
  icon?: number;
  iconBase64?: string | null;
  isSystemApp?: boolean;
}

interface AppWithSelection extends InstalledApp {
  id: string;
}

const { width } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const H_GAP = 4;
const CONTAINER_PAD = 6;
const ITEM_WIDTH = (width - CONTAINER_PAD * 2 - H_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

function formatApkSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppsTab() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppWithSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const toggleFile = useSelectionStore((s) => s.toggleFile);
  const selectAll = useSelectionStore((s) => s.selectAll);

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

  // Auto-refresh each time the tab gains focus (pull-to-refresh remains for manual)
  useFocusEffect(
    useCallback(() => {
      if (useSettingsStore.getState().autoRefresh) {
        loadInstalledApps(true);
      }
    }, [loadInstalledApps])
  );

  const filteredApps = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter((a) => a.name.toLowerCase().includes(q) || a.packageName.toLowerCase().includes(q));
  }, [apps, search]);

  const filteredUserApps = useMemo(() => filteredApps.filter((a) => !a.isSystemApp), [filteredApps]);
  const filteredSystemApps = useMemo(() => filteredApps.filter((a) => !!a.isSystemApp), [filteredApps]);

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
              <MaterialIcons name="apps" size={28} color={C.primary} />
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

  // Re-usable card for system grid (same UI, standalone, no box)
  const renderSystemCard = useCallback((item: AppWithSelection) => {
    const selected = !!selectedFiles[item.id];
    const hasRealIcon = !!item.iconBase64;
    return (
      <TouchableOpacity
        key={item.id}
        onPress={() => handleSelectApp(item)}
        style={[styles.gridItem, selected && styles.gridItemSelected]}
        activeOpacity={0.85}
      >
        <View style={styles.iconWrap}>
          {hasRealIcon ? (
            <Image source={{ uri: `data:image/png;base64,${item.iconBase64}` }} style={styles.appIcon} resizeMode="cover" />
          ) : (
            <View style={styles.fallbackIcon}>
              <MaterialIcons name="apps" size={28} color={C.primary} />
            </View>
          )}
          {selected && (
            <View style={styles.checkBadge}>
              <MaterialIcons name="check" size={14} color="white" />
            </View>
          )}
        </View>
        <Text style={styles.appNameGrid} numberOfLines={2}>{item.name}</Text>
        {getApkSize(item.packageName) > 0 && (
          <Text style={styles.apkSize} numberOfLines={1}>{formatApkSize(getApkSize(item.packageName))}</Text>
        )}
      </TouchableOpacity>
    );
  }, [selectedFiles, handleSelectApp]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={C.primary} />
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
          <MaterialIcons name="search" size={20} color={C.textMuted} />
          <TextInput
            placeholder="Search apps"
            placeholderTextColor={C.textMuted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={18} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity onPress={handleSelectAll} style={styles.actionButton}>
          <MaterialIcons name="select-all" size={16} color={C.primary} />
          <Text style={styles.actionText}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDeselectAll} style={[styles.actionButton, styles.actionButtonClear]}>
          <MaterialIcons name="clear" size={16} color={C.textSecondary} />
          <Text style={[styles.actionText, { color: C.textSecondary }]}>Clear</Text>
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="warning-amber" size={20} color={C.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={filteredUserApps}
        keyExtractor={(item) => item.id}
        renderItem={renderAppItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={filteredUserApps.length > 1 ? styles.columnWrapper : undefined}
        contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) + 108 }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={21}
        windowSize={7}
        maxToRenderPerBatch={21}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadInstalledApps(true)} colors={[C.primary]} />
        }
        ListHeaderComponent={
          filteredUserApps.length > 0 ? (
            <View style={styles.listSectionHeader}>
              <View style={styles.listSectionTitleRow}>
                <MaterialIcons name="person" size={14} color={C.textSecondary} />
                <Text style={styles.listSectionTitle}>Installed Apps</Text>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          filteredSystemApps.length > 0 ? (
            <View style={styles.emptyUserSection}>
              <MaterialIcons name="apps" size={32} color={C.surfaceBorder} />
              <Text style={styles.emptyUserTitle}>{search ? 'No user apps match' : 'No user apps'}</Text>
              <Text style={styles.emptyUserSub}>{search ? `No user apps match "${search}"` : 'All launchable apps are system apps — see below.'}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="apps" size={64} color={C.surfaceBorder} />
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
          )
        }
        ListFooterComponent={
          <View>
            {/* System Apps Section - same UI, below first section */}
            {filteredSystemApps.length > 0 && (
              <View style={styles.systemSection}>
                <View style={styles.sectionDividerRow}>
                  <View style={styles.sectionDivider} />
                </View>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleRow}>
                    <MaterialIcons name="phone-android" size={16} color={C.textSecondary} />
                    <Text style={styles.sectionTitle}>System Apps</Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>Pre-installed device apps</Text>
                </View>
                <View style={styles.systemGrid}>
                  {filteredSystemApps.map((item) => renderSystemCard(item))}
                </View>
              </View>
            )}
            {/* When no system apps but user apps exist and search filters everything */}
            {filteredSystemApps.length === 0 && filteredUserApps.length === 0 && search.trim().length > 0 ? null : null}
          </View>
        }
      />
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.background,
    gap: 8,
  },
  loadingText: { color: C.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.semiBold, marginTop: 8 },
  loadingSub: { color: C.textMuted, fontSize: FontSize.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surfaceElevated,
    borderRadius: BorderRadius.round,
    paddingHorizontal: 12,
    height: 36,
    gap: 8,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  searchInput: { flex: 1, color: C.textPrimary, fontSize: 14, paddingVertical: 0 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: BorderRadius.round,
    backgroundColor: C.primaryGlow,
    borderWidth: 1,
    borderColor: C.primary,
  },
  actionButtonClear: {
    backgroundColor: C.surfaceElevated,
    borderColor: C.surfaceBorder,
  },
  actionText: { fontSize: 12, fontFamily: FontFamily.semiBold, color: C.primary },
  countBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: C.background,
  },
  countText: { fontSize: 12, color: C.textMuted, fontFamily: FontFamily.medium },
  refreshBtn: { padding: 4 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: C.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    margin: 8,
    borderRadius: BorderRadius.md,
  },
  errorText: { flex: 1, color: C.warning, fontSize: 13 },
  retryButton: { backgroundColor: C.warning, paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.sm },
  retryText: { color: 'white', fontSize: 12, fontFamily: FontFamily.bold },
  retryButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
  },
  retryTextLarge: { color: 'white', fontSize: FontSize.sm, fontFamily: FontFamily.bold },
  grid: { paddingHorizontal: CONTAINER_PAD, paddingTop: 4 },
  columnWrapper: { gap: H_GAP, marginBottom: H_GAP },
  listSectionHeader: {
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 6,
  },
  listSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listSectionTitle: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.textSecondary },
  gridItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    gap: 4,
  },
  gridItemSelected: { backgroundColor: 'transparent', borderColor: 'transparent', opacity: 0.9 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIcon: { width: 56, height: 56, borderRadius: 14 },
  fallbackIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.surfaceElevated,
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
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    elevation: 2,
  },
  appNameGrid: {
    fontSize: 12,
    fontFamily: FontFamily.medium,
    color: C.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
    minHeight: 30,
  },
  apkSize: { fontSize: 10, color: C.textMuted, fontFamily: FontFamily.regular },
  // System section below first grid - same standalone UI
  systemSection: {
    marginTop: 8,
    paddingTop: 8,
  },
  sectionDividerRow: {
    paddingHorizontal: CONTAINER_PAD,
    marginBottom: 10,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: C.surfaceBorder,
  },
  sectionHeader: {
    paddingHorizontal: 2,
    marginBottom: 8,
    gap: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: { fontSize: 13, fontFamily: FontFamily.semiBold, color: C.textSecondary },
  sectionSubtitle: { fontSize: 11, color: C.textMuted, fontFamily: FontFamily.regular, marginLeft: 22 },
  sectionCountBadge: {
    backgroundColor: C.surfaceElevated,
    borderRadius: BorderRadius.round,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  systemCountBadge: {
    backgroundColor: C.surfaceElevated,
  },
  sectionCountText: { fontSize: 11, fontFamily: FontFamily.bold, color: C.textSecondary },
  systemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: H_GAP,
  },
  emptyUserSection: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 6,
  },
  emptyUserTitle: { fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: C.textSecondary },
  emptyUserSub: { fontSize: FontSize.sm, color: C.textMuted, textAlign: 'center' },
  emptyContainer: {
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
    marginTop: 20,
  },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: C.textSecondary },
  emptySubtitle: { fontSize: FontSize.md, color: C.textMuted, textAlign: 'center', lineHeight: 22 },
});
