// src/screens/tabs/FilesTab.tsx
// Android file picker, Xender-like: quick browse, instant select

import React, { useState, useCallback } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';

function formatSize(bytes: number): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(mimeType: string, name: string): keyof typeof MaterialIcons.glyphMap {
  const lowerName = name.toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'videocam';
  if (mimeType.startsWith('audio/')) return 'audiotrack';
  if (mimeType.includes('pdf') || lowerName.endsWith('.pdf')) return 'picture-as-pdf';
  if (mimeType.includes('zip') || mimeType.includes('archive') || lowerName.endsWith('.zip') || lowerName.endsWith('.rar')) return 'folder-zip';
  if (mimeType.includes('word') || mimeType.includes('document') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) return 'description';
  if (lowerName.endsWith('.apk')) return 'android';
  if (lowerName.endsWith('.pdf')) return 'picture-as-pdf';
  return 'insert-drive-file';
}

export default function FilesTab() {
  const insets = useSafeAreaInsets();
  const [pickedFiles, setPickedFiles] = useState<SelectedFile[]>([]);
  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const toggleFile = useSelectionStore((s) => s.toggleFile);
  const selectAll = useSelectionStore((s) => s.selectAll);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const handlePickFiles = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: true, // MUST be true for server to read content:// reliably
      });

      if (result.canceled || !result.assets?.length) return;

      const newFiles: SelectedFile[] = await Promise.all(
        result.assets.map(async (asset) => {
          // For content:// that was copied to cache, asset.uri is now file:// cache path (good for server)
          // Verify size via FileSystem if asset.size missing
          let size = asset.size ?? 0;
          if (size === 0) {
            try {
              const info: any = await FileSystem.getInfoAsync(asset.uri);
              if (info.exists) size = info.size ?? 0;
            } catch {}
          }
          return {
            id: asset.uri, // use uri as id (file:// cache path is unique)
            name: asset.name,
            uri: asset.uri,
            size,
            mimeType: asset.mimeType ?? 'application/octet-stream',
            tab: 'Files' as const,
          };
        })
      );

      // Dedup by uri, keep local list
      setPickedFiles((prev) => {
        const existing = new Set(prev.map((f) => f.id));
        const filtered = newFiles.filter((f) => !existing.has(f.id));
        return [...prev, ...filtered];
      });

      // Auto-select newly picked (Xender behavior)
      newFiles.forEach(toggleFile);
    } catch (err: any) {
      console.error('[Files] DocumentPicker error:', err);
      Alert.alert('Pick failed', err?.message || 'Could not pick files. Try again.');
    }
  }, [toggleFile]);

  const handleRemoveFile = (file: SelectedFile) => {
    setPickedFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (selectedFiles[file.id]) toggleFile(file);
  };

  const renderItem = ({ item }: { item: SelectedFile }) => {
    const selected = !!selectedFiles[item.id];
    return (
      <TouchableOpacity
        onPress={() => toggleFile(item)}
        style={[styles.row, selected && styles.rowSelected]}
        activeOpacity={0.85}
      >
        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
          {selected ? (
            <MaterialIcons name="check" size={22} color="white" />
          ) : (
            <MaterialIcons name={getFileIcon(item.mimeType, item.name)} size={22} color={Colors.primary} />
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatSize(item.size)} • {item.mimeType.split('/').pop()?.toUpperCase() || 'FILE'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleRemoveFile(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.removeBtn}>
          <MaterialIcons name="close" size={20} color={selected ? Colors.primary : Colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <SelectionHeader
        tabName="Files"
        onSelectAll={() => selectAll(pickedFiles)}
        onClear={clearSelection}
      />

      <FlatList
        data={pickedFiles}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          pickedFiles.length === 0
            ? styles.emptyContainer
            : [styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 112 }]
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIconWrap}>
              <MaterialIcons name="folder-open" size={48} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No files chosen</Text>
            <Text style={styles.emptySubtitle}>
              Tap Browse to pick any file — documents, PDFs, ZIPs, APKs, etc. Files stay on your device until you send them.
            </Text>
            <TouchableOpacity style={styles.emptyBrowse} onPress={handlePickFiles} activeOpacity={0.85}>
              <MaterialIcons name="add" size={20} color="white" />
              <Text style={styles.emptyBrowseText}>Browse Files</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {pickedFiles.length > 0 && (
        <TouchableOpacity
          style={[styles.pickButton, { bottom: Math.max(insets.bottom, 16) + 88 }]}
          onPress={handlePickFiles}
          activeOpacity={0.85}
        >
          <MaterialIcons name="add" size={22} color="white" />
          <Text style={styles.pickButtonText}>Add More Files</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { paddingVertical: Spacing.xs },
  emptyContainer: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
    backgroundColor: Colors.background,
  },
  rowSelected: { backgroundColor: Colors.primaryGlow },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  iconBoxSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  info: { flex: 1, gap: 2 },
  fileName: { color: Colors.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  meta: { color: Colors.textSecondary, fontSize: FontSize.sm, fontFamily: FontFamily.regular },
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
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: Colors.textPrimary },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: FontFamily.regular,
    maxWidth: 320,
  },
  emptyBrowse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
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
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  pickButtonText: { color: 'white', fontFamily: FontFamily.bold, fontSize: FontSize.md },
});

