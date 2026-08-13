// src/components/SelectionHeader.tsx
// Persistent header shown when in selection mode (Phase 4)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
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
  const selectionMode = count > 0;

  if (!selectionMode) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onClear} style={styles.clearButton}>
        <MaterialIcons name="close" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Text style={styles.countText}>
        {count} selected
      </Text>

      <TouchableOpacity onPress={onSelectAll} style={styles.selectAllButton}>
        <Text style={styles.selectAllText}>Select All</Text>
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
    flex: 1,
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: FontSize.md,
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
