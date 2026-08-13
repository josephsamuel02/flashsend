// src/components/PermissionGate.tsx
// Shows a contextual permission request UI before triggering OS prompt
// Handles "denied, don't ask again" with a settings deep-link (Phase 2 & 8)

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';

interface Props {
  iconName: keyof typeof MaterialIcons.glyphMap;
  title: string;
  description: string;
  onRequest: () => void;
  denied?: boolean;
}

export default function PermissionGate({ iconName, title, description, onRequest, denied }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name={iconName} size={48} color={Colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>

      {denied ? (
        <View style={styles.deniedContainer}>
          <Text style={styles.deniedText}>
            Permission was denied. Please enable it in your device settings.
          </Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Open app settings"
          >
            <MaterialIcons name="settings" size={16} color={Colors.background} />
            <Text style={styles.buttonText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.requestButton}
          onPress={onRequest}
          accessibilityRole="button"
          accessibilityLabel={`Grant ${title}`}
        >
          <MaterialIcons name="check-circle" size={18} color={Colors.background} />
          <Text style={styles.buttonText}>Grant Access</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  requestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
    marginTop: Spacing.sm,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.round,
  },
  buttonText: {
    color: Colors.background,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  deniedContainer: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  deniedText: {
    color: Colors.warning,
    textAlign: 'center',
    fontSize: FontSize.sm,
  },
});
