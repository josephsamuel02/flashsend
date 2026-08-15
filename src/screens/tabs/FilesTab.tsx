// src/screens/tabs/FilesTab.tsx
// General files picker via OS document picker (Phase 4)

import React, { useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Text,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore, SelectedFile } from '../../store/selectionStore';
import SelectionHeader from '../../components/SelectionHeader';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../theme/colors';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(mimeType: string): keyof typeof MaterialIcons.glyphMap {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'videocam';
  if (mimeType.startsWith('audio/')) return 'audiotrack';
  if (mimeType.includes('pdf')) return 'picture-as-pdf';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return 'folder-zip';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
  return 'insert-drive-file';
}

export default function FilesTab() {
  const insets = useSafeAreaInsets();
  const [pickedFiles, setPickedFiles] = useState<SelectedFile[]>([]);
  const { toggleFile, isSelected, selectAll, clearSelection, selectedFiles } = useSelectionStore();

  const handlePickFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: true,
        copyToCacheDirectory: false,
      });

      if (result.canceled) return;

      const newFiles: SelectedFile[] = result.assets.map((asset) => ({
        id: asset.uri,
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        tab: 'Files' as const,
      }));

      // Add to the local list (dedup by uri)
      setPickedFiles((prev) => {
        const ids = new Set(prev.map((f) => f.id));
        return [...prev, ...newFiles.filter((f) => !ids.has(f.id))];
      });

      // Auto-select the newly picked files
      newFiles.forEach(toggleFile);
    } catch (err) {
      console.error('[Files] DocumentPicker error:', err);
    }
  };

  const handleRemoveFile = (file: SelectedFile) => {
    setPickedFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (isSelected(file.id)) toggleFile(file);
  };

  const renderItem = ({ item }: { item: SelectedFile }) => {
    const selected = isSelected(item.id);
    return (
      <TouchableOpacity
        onPress={() => toggleFile(item)}
        style={[styles.row, selected && styles.rowSelected]}
        activeOpacity={0.8}
        accessibilityLabel={`File: ${item.name}${selected ? ', selected' : ''}`}
        accessibilityRole="button"
      >
        <View style={[styles.iconBox, selected && styles.iconBoxSelected]}>
          {selected
            ? <MaterialIcons name="check" size={22} color="white" />
            : <MaterialIcons name={getFileIcon(item.mimeType)} size={22} color={Colors.primary} />
          }
        </View>
        <View style={styles.info}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>{item.size > 0 ? formatSize(item.size) : 'Unknown size'}</Text>
        </View>
        <TouchableOpacity onPress={() => handleRemoveFile(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="close" size={20} color={Colors.textMuted} />
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
        contentContainerStyle={pickedFiles.length === 0 ? styles.emptyContainer : [styles.list, { paddingBottom: Math.max(insets.bottom, 16) + 96 }]}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialIcons name="folder-open" size={64} color={Colors.surfaceBorder} />
            <Text style={styles.emptyTitle}>No files selected</Text>
            <Text style={styles.emptySubtitle}>
              Tap the button below to browse and pick any file from your device.
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.pickButton, { bottom: Math.max(insets.bottom, 16) + 88 }]}
        onPress={handlePickFiles}
        accessibilityRole="button"
        accessibilityLabel="Browse files"
      >
        <MaterialIcons name="add" size={22} color="white" />
        <Text style={styles.pickButtonText}>Browse Files</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  list: { paddingVertical: Spacing.sm },
  emptyContainer: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  rowSelected: { backgroundColor: Colors.primaryGlow },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSelected: { backgroundColor: Colors.primary },
  info: { flex: 1 },
  fileName: { color: Colors.textPrimary, fontSize: FontSize.md, fontFamily: FontFamily.semiBold },
  meta: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 2, fontFamily: FontFamily.regular },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.bold, color: Colors.textSecondary },
  emptySubtitle: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: FontFamily.regular,
  },
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
    elevation: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  pickButtonText: { color: 'white', fontFamily: FontFamily.bold, fontSize: FontSize.md },
});
