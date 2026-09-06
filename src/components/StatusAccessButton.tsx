// src/components/StatusAccessButton.tsx
// Single "Get Status" button. Opens the system All-files-access page.

import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors, type ThemeColors, FontFamily, BorderRadius } from '../theme/colors';
import { openAllFilesAccessSettings } from '../lib/statusAccess';

export default function StatusAccessButton({ onDone }: { onDone?: () => void }) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await openAllFilesAccessSettings();
    } finally {
      setBusy(false);
      onDone?.();
    }
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={handlePress} disabled={busy} activeOpacity={0.85}>
      {busy ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <MaterialIcons name="folder-open" size={20} color="white" />
      )}
      <Text style={styles.text}>Get Status</Text>
    </TouchableOpacity>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.primary,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: BorderRadius.round,
    minWidth: 220,
    elevation: 4,
  },
  text: { color: 'white', fontFamily: FontFamily.bold, fontSize: 16 },
});
