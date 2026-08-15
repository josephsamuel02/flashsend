// src/screens/tabs/AppsTab.tsx
// Grid of installed apps with real icons from native module

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { getInstalledApps } from 'sendapp-native';

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
const H_GAP = Spacing.sm;
const CONTAINER_PAD = Spacing.md;
const ITEM_WIDTH = (width - CONTAINER_PAD * 2 - H_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export default function AppsTab() {
  const insets = useSafeAreaInsets();
  const [apps, setApps] = useState<AppWithSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toggleFile, isSelected, selectAll, clearSelection, selectedFiles } = useSelectionStore();

  const loadInstalledApps = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      if (Platform.OS !== 'android') {
        const mockApps: AppWithSelection[] = [
          { id: 'com.apple.mobilesafari', name: 'Safari', packageName: 'com.apple.mobilesafari' },
          { id: 'com.apple.mobilemail', name: 'Mail', packageName: 'com.apple.mobilemail' },
          { id: 'com.apple.camera', name: 'Camera', packageName: 'com.apple.camera' },
          { id: 'com.apple.photos', name: 'Photos', packageName: 'com.apple.photos' },
          { id: 'com.apple.music', name: 'Music', packageName: 'com.apple.music' },
        ];
        setApps(mockApps);
        return;
      }

      const installedApps: InstalledApp[] = await getInstalledApps();

      if (!installedApps || installedApps.length === 0) {
        setError(
          'No apps found. This usually means QUERY_ALL_PACKAGES / <queries> not in AndroidManifest. Rebuild the dev-client: npx expo prebuild --clean && npx expo run:android'
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
      console.error('Failed to load apps:', err);
      const msg = err?.message || 'Failed to load installed apps';
      const hint = msg.includes('Native module') || msg.includes('not available')
        ? ' Native module not linked - rebuild dev-client (eas build --profile development or npx expo run:android). Expo Go will not work.'
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

  const handleSelectAll = () => {
    const selectedFiles: SelectedFile[] = apps.map((app) => ({
      id: app.id,
      name: app.name,
      uri: app.packageName,
      size: 0,
      mimeType: 'application/vnd.android.package-archive',
      tab: 'Apps' as const,
    }));
    selectAll(selectedFiles);
  };

  const handleSelectApp = (app: AppWithSelection) => {
    const file: SelectedFile = {
      id: app.id,
      name: app.name,
      uri: app.packageName,
      size: 0,
      mimeType: 'application/vnd.android.package-archive',
      tab: 'Apps' as const,
    };
    toggleFile(file);
  };

  const renderAppItem = ({ item }: { item: AppWithSelection }) => {
    const selected = isSelected(item.id);
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
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={[styles.loadingText, { fontFamily: FontFamily.medium }]}>Loading installed apps...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <MaterialIcons name="apps" size={22} color={Colors.primary} />
          <Text style={[styles.headerTitle, { fontFamily: FontFamily.bold }]}>Installed Apps ({apps.length})</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSelectAll} style={styles.actionButton}>
            <MaterialIcons name="select-all" size={18} color={Colors.primary} />
            <Text style={styles.actionText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearSelection} style={styles.actionButton}>
            <MaterialIcons name="clear" size={18} color={Colors.error} />
            <Text style={[styles.actionText, { color: Colors.error }]}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.actionButton}>
            <MaterialIcons name="refresh" size={18} color={Colors.primary} />
            <Text style={styles.actionText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={apps}
        keyExtractor={(item) => item.id}
        renderItem={renderAppItem}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[styles.grid, { paddingBottom: Math.max(insets.bottom, 16) + 92 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadInstalledApps(true)} colors={[Colors.primary]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="apps" size={64} color={Colors.surfaceBorder} />
            <Text style={styles.emptyTitle}>No Apps Found</Text>
            <Text style={styles.emptySubtitle}>
              {Platform.OS === 'android'
                ? 'Unable to load installed apps. Try pull-to-refresh or rebuild the dev-client.'
                : 'App listing is not available on iOS.'}
            </Text>
            <TouchableOpacity onPress={() => loadInstalledApps()} style={styles.retryButtonLarge}>
              <MaterialIcons name="refresh" size={18} color="white" />
              <Text style={styles.retryTextLarge}>Retry</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {Object.keys(selectedFiles).length > 0 && (
        <View style={[styles.selectionIndicator, { bottom: Math.max(insets.bottom, 16) + 88 }]}>
          <MaterialIcons name="check-circle" size={20} color={Colors.primary} />
          <Text style={[styles.selectionText, { fontFamily: FontFamily.semiBold }]}>
            {Object.keys(selectedFiles).length} app{Object.keys(selectedFiles).length !== 1 ? 's' : ''} selected
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.md,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontFamily: FontFamily.medium,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.bold,
    color: Colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
  },
  actionText: {
    fontSize: 11,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    margin: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  errorText: {
    flex: 1,
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
  },
  retryButton: {
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  retryText: {
    color: 'white',
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
  },
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
  retryTextLarge: {
    color: 'white',
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
  },
  grid: {
    paddingHorizontal: CONTAINER_PAD,
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  columnWrapper: {
    gap: H_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.surfaceBorder,
    gap: 8,
  },
  gridItemSelected: {
    backgroundColor: Colors.primaryGlow,
    borderColor: Colors.primary,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
  },
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
    gap: Spacing.md,
    width: width - CONTAINER_PAD * 2,
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    color: Colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: FontFamily.regular,
  },
  selectionIndicator: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectionText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.primary,
  },
});
