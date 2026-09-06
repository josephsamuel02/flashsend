// src/components/FloatingActionButtons.tsx
// Xender-like FABs: Send (with count) + Receive, Android-optimized

import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { useColors, type ThemeColors, Spacing, BorderRadius } from '../theme/colors';

interface Props {
  onSendPress: () => void;
  onReceivePress: () => void;
}

export default function FloatingActionButtons({ onSendPress, onReceivePress }: Props) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const selectedCount = useSelectionStore((s) => Object.keys(s.selectedFiles).length);
  const totalSize = useSelectionStore((s) => Object.values(s.selectedFiles).reduce((sum, f) => sum + (f.size || 0), 0));
  const sessionState = useTransferStore((s) => s.sessionState);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected' || sessionState === 'done';
  const filesCount = useTransferStore((s) => s.files.length);

  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (selectedCount > 0) {
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 140, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [selectedCount, pulse]);

  const sendDisabled = false; // always enabled per spec, even with 0 files (QR still generated)

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 20) + 16 }]} pointerEvents="box-none">
      {/* Receive — left */}
      <TouchableOpacity
        style={[styles.fab, styles.fabReceive]}
        onPress={onReceivePress}
        activeOpacity={0.88}
      >
        <MaterialIcons name={isTransferActive && filesCount > 0 ? 'swap-vert' : 'download'} size={20} color="white" />
        <Text style={styles.fabLabel}>{isTransferActive && filesCount > 0 ? 'Transfer' : 'Receive'}</Text>
      </TouchableOpacity>

      {/* Send — right, with animated badge */}
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <TouchableOpacity
          style={[styles.fab, styles.fabSend, sendDisabled && styles.fabDisabled]}
          onPress={onSendPress}
          activeOpacity={0.88}
          disabled={sendDisabled}
        >
          <MaterialIcons name={isTransferActive ? 'sync' : 'upload'} size={20} color="white" />
          <Text style={styles.fabLabel}>
            {isTransferActive ? 'Sharing' : selectedCount > 0 ? `Send (${selectedCount})` : 'Send'}
          </Text>
          {selectedCount > 0 && !isTransferActive && (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{selectedCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    zIndex: 100,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: BorderRadius.round,
    gap: 8,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    minWidth: 120,
    justifyContent: 'center',
  },
  fabReceive: { backgroundColor: C.primary, shadowColor: C.primary },
  fabSend: { backgroundColor: '#0A0A1A', shadowColor: '#000', borderColor: 'rgba(255,255,255,0.14)' },
  fabDisabled: { opacity: 0.6 },
  fabLabel: { color: 'white', fontFamily: 'Outfit_700Bold', fontSize: 14, letterSpacing: 0.3 },
  countBadge: {
    backgroundColor: C.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 2,
    borderWidth: 2,
    borderColor: 'white',
  },
  countBadgeText: { color: 'white', fontWeight: '800', fontSize: 11 },
});
