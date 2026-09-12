// src/screens/tabs/StatusTab.tsx
// WhatsApp statuses. Gate shows only Get Status. Grid has per-item folder save, no Save All.

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  Alert,
  AppState,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSettingsStore } from '../../store/settingsStore';
import StatusAccessButton from '../../components/StatusAccessButton';
import {
  hasStatusAccess,
  listStatusFiles,
  saveStatusToGallery,
  type StatusItem,
} from '../../lib/statusAccess';
import { useColors, type ThemeColors, BorderRadius } from '../../theme/colors';
import type { ViewerAsset } from '../MediaViewerScreen';

const { width } = Dimensions.get('window');
const COLUMNS = 3;
const GAP = 4;
const H_PAD = 4;
const CELL_SIZE = (width - H_PAD * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

export default function StatusTab() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [access, setAccess] = useState<boolean | null>(null);
  const [files, setFiles] = useState<StatusItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkAndLoad = useCallback(async (isRefresh = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const ok = await hasStatusAccess();
      setAccess(ok);
      if (!ok) {
        setFiles([]);
        return;
      }
      const { waStatus, waBusinessStatus } = useSettingsStore.getState();
      const items = await listStatusFiles({ wa: waStatus, business: waBusinessStatus });
      setFiles(items);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      busyRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (useSettingsStore.getState().autoRefresh || access === null) {
        checkAndLoad(true);
      } else {
        hasStatusAccess().then((ok) => {
          setAccess(ok);
          if (ok && files.length === 0) checkAndLoad(true);
        }).catch(() => {});
      }
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') checkAndLoad(true);
      });
      return () => sub.remove();
    }, [checkAndLoad]) // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSave = useCallback(async (item: StatusItem) => {
    if (savingId) return;
    setSavingId(item.id);
    try {
      await saveStatusToGallery(item.uri, item.name);
      setSavedId(item.id);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedId(null), 1500);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message?.slice(0, 140) || 'Try again');
    } finally {
      setSavingId(null);
    }
  }, [savingId]);

  const openViewer = useCallback(
    (item: StatusItem) => {
      const viewerAssets: ViewerAsset[] = files.map((f) => ({
        id: f.id,
        uri: f.uri,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
      }));
      navigation.navigate('MediaViewer', {
        assets: viewerAssets,
        initialIndex: Math.max(0, files.findIndex((f) => f.id === item.id)),
      });
    },
    [files, navigation]
  );

  if (access === false) {
    return (
      <View style={[styles.gate, { paddingBottom: Math.max(insets.bottom, 16) + 96 }]}>
        <StatusAccessButton onDone={() => checkAndLoad(true)} />
      </View>
    );
  }

  const renderEmpty = () => (
    <View style={styles.emptyWrap}>
      <MaterialIcons name="photo-library" size={64} color={C.surfaceBorder} />
      <Text style={styles.emptyTitle}>No statuses found</Text>
      <Text style={styles.emptySub}>
        View a WhatsApp status first, then tap below to grant storage access and load them here.
      </Text>
      <StatusAccessButton onDone={() => checkAndLoad(true)} />
    </View>
  );

  const renderItem = ({ item }: { item: StatusItem }) => {
    const isVideo = item.mimeType.startsWith('video');
    const saving = savingId === item.id;
    const saved = savedId === item.id;
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => openViewer(item)} style={styles.cell}>
        <Image source={{ uri: item.uri }} style={styles.thumbnail} fadeDuration={0} />
        {isVideo && (
          <View style={styles.playBadge} pointerEvents="none">
            <MaterialIcons name="play-arrow" size={18} color="white" />
          </View>
        )}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => handleSave(item)}
          disabled={saving}
          style={styles.saveBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {saving ? (
            <ActivityIndicator color="white" size="small" />
          ) : saved ? (
            <MaterialIcons name="check" size={16} color="white" />
          ) : (
            <MaterialIcons name="folder" size={16} color="white" />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {access === null || (loading && files.length === 0 && !refreshing) ? (
        <View style={styles.centered}>
          <ActivityIndicator color={C.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item.id}
          numColumns={COLUMNS}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: Math.max(insets.bottom, 16) + 96 },
            files.length === 0 ? styles.gridEmpty : undefined,
          ]}
          columnWrapperStyle={files.length > 0 ? styles.columnWrapper : undefined}
          windowSize={7}
          initialNumToRender={30}
          maxToRenderPerBatch={30}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => checkAndLoad(true)} colors={[C.primary]} />
          }
          ListEmptyComponent={!loading && !refreshing ? renderEmpty() : null}
        />
      )}
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background },
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.background, padding: 24 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: C.textSecondary, textAlign: 'center' },
  emptySub: { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
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
  thumbnail: { width: '100%', height: '100%' },
  playBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'white',
    elevation: 3,
  },
});
