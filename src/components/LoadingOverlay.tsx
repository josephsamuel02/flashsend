// src/components/LoadingOverlay.tsx
// Reusable loading overlay with message support

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useColors, type ThemeColors, Spacing, FontSize, FontFamily } from '../theme/colors';

interface Props {
  visible: boolean;
  message?: string;
  submessage?: string;
}

export default function LoadingOverlay({ visible, message, submessage }: Props) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color={C.primary} />
          {message && <Text style={styles.message}>{message}</Text>}
          {submessage && <Text style={styles.submessage}>{submessage}</Text>}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: Spacing.xl,
    minWidth: 200,
    alignItems: 'center',
    gap: Spacing.md,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  message: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: C.textPrimary,
    textAlign: 'center',
  },
  submessage: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: -Spacing.xs,
  },
});
