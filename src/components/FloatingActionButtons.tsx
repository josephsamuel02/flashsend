// src/components/FloatingActionButtons.tsx
// Two FABs: Send (bottom-right) and Receive (bottom-left)
// Always visible, disable Send if nothing selected

import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme/colors';

interface Props {
  onSendPress: () => void;
  onReceivePress: () => void;
}

export default function FloatingActionButtons({ onSendPress, onReceivePress }: Props) {
  const selectedCount = useSelectionStore((s) => Object.keys(s.selectedFiles).length);
  const sessionState = useTransferStore((s) => s.sessionState);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected';

  const sendScale = useRef(new Animated.Value(selectedCount > 0 ? 1 : 0.85)).current;
  const sendOpacity = useRef(new Animated.Value(selectedCount > 0 ? 1 : 0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(sendScale, {
        toValue: selectedCount > 0 ? 1 : 0.85,
        useNativeDriver: true,
        tension: 300,
        friction: 15,
      }),
      Animated.timing(sendOpacity, {
        toValue: selectedCount > 0 ? 1 : 0.4,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selectedCount]);

  const handleSendPress = () => {
    if (isTransferActive) {
      // Navigate to active transfer instead of starting new
      onSendPress();
    } else if (selectedCount > 0) {
      onSendPress();
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Receive FAB - bottom left */}
      <TouchableOpacity
        style={[styles.fab, styles.fabReceive]}
        onPress={onReceivePress}
        activeOpacity={0.85}
        accessibilityLabel="Receive files"
        accessibilityRole="button"
      >
        <MaterialIcons name="qr-code-scanner" size={26} color={Colors.background} />
        <Text style={styles.fabLabel}>Receive</Text>
      </TouchableOpacity>

      {/* Send FAB - bottom right */}
      <Animated.View style={[{ transform: [{ scale: sendScale }], opacity: sendOpacity }]}>
        <TouchableOpacity
          style={[styles.fab, styles.fabSend, selectedCount === 0 && !isTransferActive && styles.fabDisabled]}
          onPress={handleSendPress}
          activeOpacity={selectedCount > 0 || isTransferActive ? 0.85 : 1}
          disabled={selectedCount === 0 && !isTransferActive}
          accessibilityLabel={
            isTransferActive
              ? 'View active transfer'
              : selectedCount > 0
              ? `Send ${selectedCount} file${selectedCount > 1 ? 's' : ''}`
              : 'Send (select files first)'
          }
          accessibilityRole="button"
        >
          <MaterialIcons
            name={isTransferActive ? 'swap-horiz' : 'send'}
            size={26}
            color={Colors.background}
          />
          <Text style={styles.fabLabel}>
            {isTransferActive ? 'Transfer' : selectedCount > 0 ? `Send (${selectedCount})` : 'Send'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 80,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    zIndex: 100,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: BorderRadius.round,
    gap: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  fabReceive: {
    backgroundColor: Colors.fabReceive,
    shadowColor: Colors.fabReceive,
  },
  fabSend: {
    backgroundColor: Colors.fabSend,
    shadowColor: Colors.fabSend,
  },
  fabDisabled: {
    backgroundColor: Colors.surfaceElevated,
    shadowColor: 'transparent',
  },
  fabLabel: {
    color: Colors.background,
    fontWeight: '700',
    fontSize: FontSize.md,
    letterSpacing: 0.3,
  },
});
