// src/components/SelectionHeader.tsx
// Persistent header shown when in selection mode (Phase 4)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelectionStore } from '../store/selectionStore';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';

interface Props {
  onSelectAll: () => void;
  onClear: () => void;
  tabName: string;
}

export default function SelectionHeader({ onSelectAll, onClear, tabName }: Props) {
  const count = useSelectionStore((s) => Object.keys(s.selectedFiles).length);
  const countByTab = useSelectionStore((s) => Object.values(s.selectedFiles).filter((f) => f.tab === tabName).length);
  const totalSize = useSelectionStore((s) => Object.values(s.selectedFiles).reduce((acc, f) => acc + (f.size || 0), 0));
  const selectionMode = count > 0;

  if (!selectionMode) return null;

  const formatSize = (b: number) => {
    if (!b) return '';
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
    return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onClear} style={styles.clearButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="close" size={20} color={Colors.textPrimary} />
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text style={styles.countText}>
          {count} selected • {countByTab} in {tabName}
        </Text>
        {totalSize > 0 && <Text style={styles.sizeText}>{formatSize(totalSize)}</Text>}
      </View>

      <TouchableOpacity onPress={onSelectAll} style={styles.selectAllButton}>
        <MaterialIcons name="select-all" size={16} color={Colors.primary} />
        <Text style={styles.selectAllText}>All</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    gap: Spacing.sm,
  },
  clearButton: {
    padding: Spacing.xs,
  },
  countText: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  sizeText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 1,
  },
  selectAllButton: {
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  selectAllText: {
    color: Colors.primaryLight,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
