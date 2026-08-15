// src/components/FloatingActionButtons.tsx
// Two FABs: Send (bottom-right) and Receive (bottom-left)
// Send button always visible and clickable without selection to generate QR code
// Receive button shows QR scanner

import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { Colors, Spacing, BorderRadius, FontSize } from '../theme/colors';

interface Props {
  onSendPress: () => void;
  onReceivePress: () => void;
}

export default function FloatingActionButtons({ onSendPress, onReceivePress }: Props) {
  const insets = useSafeAreaInsets();
  const selectedCount = useSelectionStore((s) => Object.keys(s.selectedFiles).length);
  const sessionState = useTransferStore((s) => s.sessionState);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected';

  // Always animate send button (not dependent on selection anymore)
  const sendScale = useRef(new Animated.Value(1)).current;
  const sendOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Reset animation values
    sendScale.setValue(1);
    sendOpacity.setValue(1);
  }, []);

  return (
    <View style={[styles.container, { bottom: Math.max(insets.bottom, 16) + 16 }]} pointerEvents="box-none">
      {/* Receive FAB - bottom left */}
      <TouchableOpacity
        style={[styles.fab, styles.fabReceive]}
        onPress={onReceivePress}
        activeOpacity={0.85}
        accessibilityLabel="Receive files"
        accessibilityRole="button"
      >
        <MaterialIcons name="download" size={20} color="white" />
        <Text style={styles.fabLabel}>Receive</Text>
      </TouchableOpacity>

      {/* Send FAB - bottom right (always enabled) */}
      <Animated.View style={[{ transform: [{ scale: sendScale }], opacity: sendOpacity }]}>
        <TouchableOpacity
          style={[styles.fab, styles.fabSend]}
          onPress={onSendPress}
          activeOpacity={0.85}
          accessibilityLabel={
            isTransferActive
              ? 'View active transfer'
              : 'Generate QR code for sending'
          }
          accessibilityRole="button"
        >
          <MaterialIcons
            name={isTransferActive ? 'sync' : 'upload'}
            size={20}
            color="white"
          />
          <Text style={styles.fabLabel}>
            {isTransferActive ? 'Transfer' : 'Send'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
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
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.round,
    gap: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  fabReceive: {
    backgroundColor: Colors.fabReceive,
    shadowColor: Colors.fabReceive,
  },
  fabSend: {
    backgroundColor: Colors.fabSend,
    shadowColor: Colors.fabSend,
  },
  fabLabel: {
    color: 'white',
    fontFamily: 'Outfit_700Bold',
    fontSize: 13,
    letterSpacing: 0.4,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
