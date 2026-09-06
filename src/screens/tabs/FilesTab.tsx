// src/screens/tabs/FilesTab.tsx
// File manager - browse filesystem, folders at top, biggest files first, categorize FlashSend recv

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import { useSettingsStore } from '../../store/settingsStore';
import SelectionHeader from '../../components/SelectionHeader';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';
import * as SendappNative from 'sendapp-native';
import type { FileEntry } from 'sendapp-native';

const getStorageRoots = (SendappNative as any).getStorageRoots as (() => any[]) | undefined;
const listDirectoryNative = (SendappNative as any).listDirectory as ((path: string) => Promise<FileEntry[]>) | undefined;
const getFlashSendBaseDir = (SendappNative as any).getFlashSendBaseDir as (() => string | null) | undefined;
const ensureFlashSendDirs = (SendappNative as any).ensureFlashSendDirs as (() => Promise<Record<string,string>>) | undefined;

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString();
}

function getFileIcon(mimeType: string, name: string, isDirectory: boolean): keyof typeof MaterialIcons.glyphMap {
  if (isDirectory) return 'folder';
  const lowerName = name.toLowerCase();
  const ext = lowerName.split('.').pop() || '';
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext)) return 'image';
  if (mimeType.startsWith('video/') || ['mp4','mkv','avi','mov','wmv'].includes(ext)) return 'videocam';
  if (mimeType.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext)) return 'audiotrack';
  if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) return 'picture-as-pdf';
  if (['zip','rar','7z','tar','gz'].includes(ext) || mimeType.includes('zip') || mimeType.includes('archive')) return 'folder-zip';
  if (['doc','docx'].includes(ext) || mimeType.includes('word') || mimeType.includes('document')) return 'description';
  if (['xls','xlsx','csv'].includes(ext)) return 'table-chart';
  if (['ppt','pptx'].includes(ext)) return 'slideshow';
  if (lowerName.endsWith('.apk') || ext === 'apk') return 'android';
  if (['txt','json','xml','html'].includes(ext)) return 'article';
  return 'insert-drive-file';
}

function getIconColor(mimeType: string, name: string, isDirectory: boolean, C: ThemeColors): string {
  if (isDirectory) return '#FFA000';
  const ext = name.toLowerCase().split('.').pop() || '';
  if (mimeType.startsWith('image/')) return '#4CAF50';
  if (mimeType.startsWith('video/')) return '#E91E63';
  if (mimeType.startsWith('audio/')) return '#9C27B0';
  if (ext === 'apk') return '#4CAF50';
  if (ext === 'pdf') return '#F44336';
  if (['zip','rar'].includes(ext)) return '#FF9800';
  return C.primary;
}

async function requestStoragePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const api = Platform.Version as number;
    // For Android 13+, File API needs READ_MEDIA but also MANAGE_EXTERNAL_STORAGE for full browsing;
    // we request what is available and fallback gracefully.
    const perms: string[] = [];
    if (api >= 33) {
      perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES as string);
      perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO as string);
      perms.push(PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO as string);
      // Also try read external if still declared (for docs)
      try { perms.push((PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_VISUAL_USER_SELECTED); } catch {}
      // READ_EXTERNAL_STORAGE still needed for general files on some OEMs
      if ((PermissionsAndroid.PERMISSIONS as any).READ_EXTERNAL_STORAGE) {
        perms.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as string);
      }
    } else {
      perms.push(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as string);
      if ((PermissionsAndroid.PERMISSIONS as any).WRITE_EXTERNAL_STORAGE) {
        perms.push(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE as string);
      }
    }
    const results = await PermissionsAndroid.requestMultiple(perms as any);
    const anyGranted = Object.values(results).some(v => v === PermissionsAndroid.RESULTS.GRANTED);
    return anyGranted;
  } catch (e) {
    console.warn('[Files] permission request failed', e);
    return false;
  }
}

export default function FilesTab() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [flashDirs, setFlashDirs] = useState<Record<string,string>>({});
  const [pickedFiles, setPickedFiles] = useState<SelectedFile[]>([]);

  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const toggleFile = useSelectionStore((s) => s.toggleFile);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const isNativeAvailable = !!listDirectoryNative;

  // Init: find root path
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!isNativeAvailable) {
          setError('Native file browser not available — use Browse. Rebuild dev-client for full folders: npx expo prebuild --clean && npx expo run:android');
          setLoading(false);
          return;
        }
        // Ensure FlashSend dirs exist for receiving categorization
        try {
          const dirs = await ensureFlashSendDirs?.();
          if (dirs && !cancelled) setFlashDirs(dirs);
        } catch {}
        // Get roots and pick external storage as start
        let startPath: string | null = null;
        try {
          const roots = getStorageRoots?.() || [];
          const ext = roots.find((r: any) => r.type === 'external');
          if (ext) startPath = ext.path;
          else if (roots.length > 0) startPath = roots[0].path;
        } catch {}
        if (!startPath) {
          try { startPath = getFlashSendBaseDir?.() || null; } catch {}
        }
        if (!startPath) {
          // Fallback to documentDirectory parent for listing? use external fallback
          startPath = '/storage/emulated/0';
        }
        if (!cancelled) setCurrentPath(startPath);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Init failed');
      }
    })();
    return () => { cancelled = true; };
  }, [isNativeAvailable]);

  const loadDirectory = useCallback(async (path: string, isRefresh = false) => {
    if (!isNativeAvailable || !path) return;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      // Permission check before listing
      const canRead = await requestStoragePermission().catch(() => true);
      // Even if denied, try listing; native will throw NO_PERMISSION and we show gate
      const raw = await listDirectoryNative!(path);
      // Filter hidden if needed
      let filtered = showHidden ? raw : raw.filter(e => !e.hidden);
      // Separate folders and files
      const folders = filtered.filter(e => e.isDirectory).sort((a,b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      const files = filtered.filter(e => !e.isDirectory).sort((a,b) => {
        if (b.size !== a.size) return b.size - a.size; // biggest first
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });
      setEntries([...folders, ...files]);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn('[Files] listDirectory failed', msg);
      if (msg.includes('NO_PERMISSION') || msg.includes('permission') || msg.includes('Cannot read')) {
        setError('Storage permission needed to browse folders. Tap Grant.');
      } else {
        setError(msg.slice(0, 300));
      }
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isNativeAvailable, showHidden]);

  useEffect(() => {
    if (currentPath) loadDirectory(currentPath);
  }, [currentPath, loadDirectory]);

  // Auto-refresh each time the tab gains focus (pull-to-refresh remains for manual)
  useFocusEffect(
    useCallback(() => {
      if (currentPath && useSettingsStore.getState().autoRefresh) {
        loadDirectory(currentPath, true);
      }
    }, [currentPath, loadDirectory])
  );

  const handleNavigateInto = useCallback((folder: FileEntry) => {
    if (!folder.isDirectory) return;
    setHistory(h => [...h, currentPath || '']);
    setCurrentPath(folder.path);
  }, [currentPath]);

  const handleNavigateUp = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    if (prev) setCurrentPath(prev);
  }, [history]);

  const handleNavigateToRoot = useCallback(async () => {
    try {
      const roots = getStorageRoots?.() || [];
      const ext = roots.find((r: any) => r.type === 'external');
      setHistory([]);
      setCurrentPath(ext?.path || '/storage/emulated/0');
    } catch {
      setHistory([]);
      setCurrentPath('/storage/emulated/0');
    }
  }, []);

  const handleNavigateToFlash = useCallback(() => {
    const flash = flashDirs['root'] || flashDirs['FlashSend'] || getFlashSendBaseDir?.() || null;
    if (flash) {
      setHistory(h => [...h, currentPath || '']);
      setCurrentPath(flash);
    } else {
      Alert.alert('FlashSend folder not ready', 'Rebuild or allow storage permission.');
    }
  }, [flashDirs, currentPath]);

  const handleBreadcrumbPress = useCallback((index: number) => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    // parts[0] is storage etc; rebuild up to index
    const target = '/' + parts.slice(0, index + 1).join('/');
    // history trimming not needed; just set path and clear history beyond?
    setHistory(h => h.slice(0, Math.max(0, h.length - (parts.length - index - 1))));
    setCurrentPath(target);
  }, [currentPath]);

  const handlePickFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const newFiles: SelectedFile[] = await Promise.all(
        result.assets.map(async (asset) => {
          let size = asset.size ?? 0;
          if (size === 0) {
            try {
              const info: any = await FileSystem.getInfoAsync(asset.uri);
              if (info.exists) size = info.size ?? 0;
            } catch {}
          }
          return {
            id: asset.uri,
            name: asset.name,
            uri: asset.uri,
            size,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            tab: 'Files' as const,
          };
        })
      );
      setPickedFiles((prev) => {
        const existing = new Set(prev.map((f) => f.id));
        const filtered = newFiles.filter((f) => !existing.has(f.id));
        return [...prev, ...filtered];
      });
      newFiles.forEach(toggleFile);
    } catch (err: any) {
      Alert.alert('Pick failed', err?.message || 'Could not pick files.');
    }
  }, [toggleFile]);

  const visibleFiles = useMemo(() => {
    // Files (not folders) in current entries that are selectable
    return entries.filter(e => !e.isDirectory);
  }, [entries]);

  const handleSelectAllVisible = useCallback(() => {
    // Select all files in current directory (biggest first already) plus pickedFiles?
    const filesToSelect: SelectedFile[] = visibleFiles.map(e => ({
      id: e.path, // use path as id
      name: e.name,
      uri: `file://${e.path}`,
      size: e.size,
      mimeType: e.mimeType,
      tab: 'Files' as const,
    }));
    selectAll(filesToSelect);
  }, [visibleFiles, selectAll]);

  const handleToggleFile = useCallback((entry: FileEntry) => {
    const file: SelectedFile = {
      id: entry.path,
      name: entry.name,
      uri: `file://${entry.path}`,
      size: entry.size,
      mimeType: entry.mimeType,
      tab: 'Files' as const,
    };
    toggleFile(file);
  }, [toggleFile]);

  const handleRemovePicked = (file: SelectedFile) => {
    setPickedFiles(prev => prev.filter(f => f.id !== file.id));
    if (selectedFiles[file.id]) toggleFile(file);
  };

  const renderItem = ({ item }: { item: FileEntry }) => {
    const isDir = item.isDirectory;
    const selected = !isDir && !!selectedFiles[item.path];
    // For dirs, selected not applicable
    return (
      <TouchableOpacity
        onPress={() => isDir ? handleNavigateInto(item) : handleToggleFile(item)}
        style={[styles.row, selected && styles.rowSelected, isDir && styles.rowDir]}
        activeOpacity={0.85}
      >
        <View style={[styles.iconBox, selected && styles.iconBoxSelected, isDir && styles.iconBoxDir]}>
          {selected ? (
            <MaterialIcons name="check" size={22} color="white" />
          ) : (
            <MaterialIcons name={getFileIcon(item.mimeType, item.name, isDir)} size={22} color={getIconColor(item.mimeType, item.name, isDir, C)} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {isDir ? `${item.childCount} items` : `${formatSize(item.size)} • ${item.extension ? item.extension.toUpperCase() : item.mimeType.split('/').pop()?.toUpperCase() || 'FILE'}`}
            {item.modified ? ` • ${formatDate(item.modified)}` : ''}
          </Text>
        </View>
        {isDir ? (
          <MaterialIcons name="chevron-right" size={22} color={C.textMuted} />
        ) : (
          selected ? <MaterialIcons name="check-circle" size={22} color={C.primary} /> : null
        )}
      </TouchableOpacity>
    );
  };

  const pathParts = useMemo(() => {
    if (!currentPath) return [];
    // Split and keep root /
    const parts = currentPath.split('/').filter(Boolean);
    return parts;
  }, [currentPath]);

  if (!isNativeAvailable) {
    // Fallback old picker UI but keep header
    return (
      <View style={styles.container}>
        <SelectionHeader tabName="Files" onSelectAll={() => selectAll(pickedFiles)} onClear={clearSelection} />
        <View style={styles.notice}>
          <MaterialIcons name="folder-open" size={20} color={C.warning} />
          <Text style={styles.noticeText}>Native file browser requires dev-client rebuild. Use Browse to pick files. After rebuild you'll see folders sorted biggest-first.</Text>
        </View>
        <FlatList
          data={pickedFiles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const selected = !!selectedFiles[item.id];
            return (
              <TouchableOpacity onPress={() => toggleFile(item)} style={[styles.row, selected && styles.rowSelected]} activeOpacity={0.85}>
                <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
                  {selected ? <MaterialIcons name="check" size={22} color="white" /> : <MaterialIcons name={getFileIcon(item.mimeType, item.name, false)} size={22} color={C.primary} />}
                </View>
                <View style={styles.info}>
                  <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>{formatSize(item.size)} • {item.mimeType.split('/').pop()?.toUpperCase() || 'FILE'}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemovePicked(item)} hitSlop={{top:10,bottom:10,left:10,right:10}} style={styles.removeBtn}>
                  <MaterialIcons name="close" size={20} color={selected ? C.primary : C.textMuted} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={pickedFiles.length === 0 ? styles.emptyContainer : [styles.list, { paddingBottom: Math.max(insets.bottom,16)+112 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}><MaterialIcons name="folder-open" size={48} color={C.primary} /></View>
              <Text style={styles.emptyTitle}>No files chosen</Text>
              <Text style={styles.emptySubtitle}>Tap Browse to pick files. After rebuild you'll browse folders directly, biggest files first.</Text>
              <TouchableOpacity style={styles.emptyBrowse} onPress={handlePickFiles} activeOpacity={0.85}>
                <MaterialIcons name="add" size={20} color="white" />
                <Text style={styles.emptyBrowseText}>Browse Files</Text>
              </TouchableOpacity>
            </View>
          }
        />
        {pickedFiles.length > 0 && (
          <TouchableOpacity style={[styles.pickButton, { bottom: Math.max(insets.bottom,16)+88 }]} onPress={handlePickFiles} activeOpacity={0.85}>
            <MaterialIcons name="add" size={22} color="white" />
            <Text style={styles.pickButtonText}>Add More Files</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SelectionHeader tabName="Files" onSelectAll={handleSelectAllVisible} onClear={clearSelection} />

      {/* Path + quick actions */}
      <View style={styles.pathBar}>
        <View style={styles.pathBarTop}>
          <TouchableOpacity onPress={handleNavigateUp} disabled={history.length===0} style={[styles.upBtn, history.length===0 && { opacity:0.4 }]}>
            <MaterialIcons name="arrow-upward" size={18} color={C.primary} />
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.breadcrumb}>
            <TouchableOpacity onPress={handleNavigateToRoot} style={styles.crumbRoot}>
              <MaterialIcons name="sd-storage" size={14} color={C.textSecondary} />
              <Text style={styles.crumbText}>Storage</Text>
            </TouchableOpacity>
            {pathParts.map((part, idx) => (
              <View key={idx} style={styles.crumbSegment}>
                <Text style={styles.crumbSep}>/</Text>
                <TouchableOpacity onPress={() => handleBreadcrumbPress(idx)}>
                  <Text style={[styles.crumbText, idx===pathParts.length-1 && styles.crumbActive]} numberOfLines={1}>{part}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
        <View style={styles.quickRow}>
          <TouchableOpacity onPress={handleNavigateToFlash} style={styles.quickChip}>
            <MaterialIcons name="folder-special" size={14} color="white" />
            <Text style={styles.quickChipText}>FlashSend</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowHidden(v=>!v)} style={[styles.quickChip, styles.quickChipSecondary, showHidden && styles.quickChipActive]}>
            <MaterialIcons name={showHidden ? "visibility" : "visibility-off"} size={14} color={showHidden ? C.primary : C.textSecondary} />
            <Text style={[styles.quickChipTextSecondary, showHidden && { color: C.primary }]}>{showHidden ? 'Hide hidden' : 'Show hidden'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickFiles} style={[styles.quickChip, styles.quickChipSecondary]}>
            <MaterialIcons name="file-open" size={14} color={C.textSecondary} />
            <Text style={styles.quickChipTextSecondary}>Pick via SA</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.sortHint}>
          <MaterialIcons name="sort" size={12} color={C.textMuted} />
          <Text style={styles.sortHintText}>Biggest files first</Text>
          <Text style={styles.sortHintDot}>•</Text>
          <Text style={styles.sortHintText}>{currentPath}</Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={16} color={C.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={async () => {
            const ok = await requestStoragePermission();
            if (ok && currentPath) loadDirectory(currentPath, true);
            else Alert.alert('Permission needed', 'Grant storage permission in Settings to browse.');
          }} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Grant</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => currentPath && loadDirectory(currentPath, true)} style={[styles.errorBtn, styles.errorBtnSecondary]}>
            <Text style={[styles.errorBtnText, { color: C.textSecondary }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingText}>Loading folders…</Text>
        </View>
      ) : (
        <>
          {/* Picked via SAF section if any */}
          {pickedFiles.length > 0 && (
            <View style={styles.pickedSection}>
              <View style={styles.pickedHeader}>
                <Text style={styles.pickedTitle}>Picked via system picker • {pickedFiles.length}</Text>
                <TouchableOpacity onPress={() => setPickedFiles([])}>
                  <Text style={styles.pickedClear}>Clear</Text>
                </TouchableOpacity>
              </View>
              {pickedFiles.slice(0,3).map(f => (
                <View key={f.id} style={styles.pickedRow}>
                  <MaterialIcons name={getFileIcon(f.mimeType, f.name, false)} size={16} color={C.primary} />
                  <Text style={styles.pickedName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.pickedSize}>{formatSize(f.size)}</Text>
                  <TouchableOpacity onPress={() => handleRemovePicked(f)}><MaterialIcons name="close" size={16} color={C.textMuted} /></TouchableOpacity>
                </View>
              ))}
              {pickedFiles.length > 3 && <Text style={styles.pickedMore}>+{pickedFiles.length-3} more</Text>}
            </View>
          )}

          <FlatList
            data={entries}
            keyExtractor={(item) => item.path}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: Math.max(insets.bottom,16)+112 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => currentPath && loadDirectory(currentPath, true)} colors={[C.primary]} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialIcons name="folder-open" size={64} color={C.surfaceBorder} />
                <Text style={styles.emptyTitle}>Empty folder</Text>
                <Text style={styles.emptySubtitle}>No files or subfolders here.</Text>
                <TouchableOpacity style={styles.emptyBrowse} onPress={handlePickFiles} activeOpacity={0.85}>
                  <MaterialIcons name="add" size={20} color="white" />
                  <Text style={styles.emptyBrowseText}>Browse Files</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </>
      )}

      <TouchableOpacity style={[styles.pickButton, { bottom: Math.max(insets.bottom,16)+88 }]} onPress={handlePickFiles} activeOpacity={0.85}>
        <MaterialIcons name="add" size={22} color="white" />
        <Text style={styles.pickButtonText}>Add More Files</Text>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  list: { paddingVertical: Spacing.xs },
  emptyContainer: { flex: 1 },
  notice: { flexDirection:'row', gap:8, margin:8, padding:10, backgroundColor:'rgba(245,158,11,0.12)', borderRadius:8, borderWidth:1, borderColor:C.warning, alignItems:'flex-start' },
  noticeText: { flex:1, color:C.textSecondary, fontSize:12, lineHeight:16 },
  pathBar: { backgroundColor: C.surface, borderBottomWidth:1, borderBottomColor: C.surfaceBorder, paddingHorizontal: Spacing.sm, paddingVertical: 6, gap:6 },
  pathBarTop: { flexDirection:'row', alignItems:'center', gap:6 },
  upBtn: { width:32, height:32, borderRadius:16, backgroundColor: C.surfaceElevated, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.surfaceBorder },
  breadcrumb: { flexDirection:'row', alignItems:'center', gap:4, flex:1 },
  crumbRoot: { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:6, paddingVertical:4, backgroundColor: C.surfaceElevated, borderRadius:6 },
  crumbSegment: { flexDirection:'row', alignItems:'center', gap:4 },
  crumbSep: { color: C.textMuted },
  crumbText: { color: C.textSecondary, fontSize:12, fontFamily: FontFamily.medium, maxWidth:110 },
  crumbActive: { color: C.primary, fontFamily: FontFamily.semiBold },
  refreshBtn: { width:32, height:32, borderRadius:16, backgroundColor: C.surfaceElevated, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.surfaceBorder },
  quickRow: { flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap' },
  quickChip: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor: C.primary, paddingHorizontal:10, paddingVertical:6, borderRadius:20 },
  quickChipSecondary: { backgroundColor: C.surfaceElevated, borderWidth:1, borderColor:C.surfaceBorder },
  quickChipActive: { backgroundColor: C.primaryGlow, borderColor: C.primary },
  quickChipText: { color:'white', fontSize:11, fontFamily: FontFamily.bold },
  quickChipTextSecondary: { color: C.textSecondary, fontSize:11, fontFamily: FontFamily.semiBold },
  countPill: { marginLeft:'auto', backgroundColor: C.surfaceElevated, paddingHorizontal:8, paddingVertical:4, borderRadius:12, borderWidth:1, borderColor:C.surfaceBorder },
  countPillText: { color: C.textMuted, fontSize:11, fontFamily: FontFamily.medium },
  sortHint: { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:2 },
  sortHintText: { color: C.textMuted, fontSize:10, fontFamily: FontFamily.regular, flexShrink:1 },
  sortHintDot: { color: C.textMuted, fontSize:10 },
  errorBanner: { flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'rgba(239,68,68,0.08)', padding:8, margin:8, borderRadius:8, borderWidth:1, borderColor:C.error },
  errorText: { flex:1, color: C.error, fontSize:12 },
  errorBtn: { backgroundColor: C.error, paddingHorizontal:10, paddingVertical:6, borderRadius:6 },
  errorBtnSecondary: { backgroundColor: C.surfaceElevated, borderWidth:1, borderColor:C.surfaceBorder },
  errorBtnText: { color:'white', fontSize:12, fontFamily: FontFamily.bold },
  loadingBox: { flex:1, alignItems:'center', justifyContent:'center', gap:12, padding:24 },
  loadingText: { color: C.textMuted, fontFamily: FontFamily.medium },
  pickedSection: { backgroundColor: C.surface, padding: Spacing.sm, gap:6, borderBottomWidth:1, borderBottomColor: C.surfaceBorder },
  pickedHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  pickedTitle: { color: C.textSecondary, fontSize:12, fontFamily: FontFamily.semiBold },
  pickedClear: { color: C.primary, fontSize:12, fontFamily: FontFamily.bold },
  pickedRow: { flexDirection:'row', alignItems:'center', gap:8, paddingVertical:2 },
  pickedName: { flex:1, color: C.textPrimary, fontSize:12 },
  pickedSize: { color: C.textMuted, fontSize:11 },
  pickedMore: { color: C.textMuted, fontSize:11, fontStyle:'italic' },
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
  rowDir: { backgroundColor: C.surface },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  iconBoxSelected: { backgroundColor: C.primary, borderColor: C.primary },
  iconBoxDir: { backgroundColor: '#FFF8E1', borderColor: '#FFE082' },
  info: { flex: 1, gap: 2 },
  fileName: { color: C.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  meta: { color: C.textSecondary, fontSize: FontSize.sm, fontFamily: FontFamily.regular },
  removeBtn: { padding: 6 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: C.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.primary,
  },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: C.textPrimary },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    maxWidth: 320,
  },
  emptyBrowse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    marginTop: Spacing.sm,
  },
  emptyBrowseText: { color: 'white', fontFamily: FontFamily.bold, fontSize: FontSize.md },
  pickButton: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    elevation: 8,
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  pickButtonText: { color: 'white', fontFamily: FontFamily.bold, fontSize: FontSize.md },
});
