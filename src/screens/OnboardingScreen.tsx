// src/screens/OnboardingScreen.tsx
// One-time onboarding screen explaining permissions before OS prompts fire (Phase 8)

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';

// Permission requests
const PERMISSIONS = [
  {
    icon: 'photo-library' as const,
    title: 'Photo & Media Library',
    description: 'Access photos, videos, and audio files you want to share.',
    permissionType: 'media-library',
  },
  {
    icon: 'camera-alt' as const,
    title: 'Camera',
    description: 'Scan the QR code displayed on the sending device to pair.',
    permissionType: 'camera',
  },
  {
    icon: 'wifi' as const,
    title: 'Local Network',
    description: 'Transfer files directly between devices on the same WiFi — no internet required.',
    permissionType: 'wifi',
  },
  ...(Platform.OS === 'android' ? [{
    icon: 'notifications' as const,
    title: 'Notifications',
    description: 'Show transfer progress notifications while the app is in the background.',
    permissionType: 'notifications',
  }] : []),
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [requestingPermissions, setRequestingPermissions] = useState(false);

  const handleRequestAllPermissions = async () => {
    setRequestingPermissions(true);
    
    // Request all permissions
    try {
      // Note: In a real app, you would request each permission here
      // For Expo, permissions are requested when each feature is first used
      // This screen is just for user education and consent
      setRequestingPermissions(false);
      onComplete();
    } catch (error) {
      console.error('Permission request error:', error);
      setRequestingPermissions(false);
    }
  };
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="flash-on" size={64} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Welcome to Flash Send</Text>
          <Text style={styles.heroSubtitle}>
            Share files instantly between devices on the same WiFi network.
            No accounts. No cloud. No limits.
          </Text>
        </View>

        {/* How it works */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.stepList}>
            {[
              { n: '1', text: 'Select files from any tab' },
              { n: '2', text: 'Tap Send → share the QR code' },
              { n: '3', text: 'Other device taps Receive → scans it' },
              { n: '4', text: 'Files transfer directly over WiFi' },
            ].map((step) => (
              <View key={step.n} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{step.n}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions we'll ask for</Text>
          <Text style={styles.sectionSubtitle}>
            These will only be requested when you first use each feature.
          </Text>
          {PERMISSIONS.map((perm) => (
            <View key={perm.title} style={styles.permRow}>
              <View style={styles.permIcon}>
                <MaterialIcons name={perm.icon} size={22} color={Colors.primary} />
              </View>
              <View style={styles.permInfo}>
                <Text style={styles.permTitle}>{perm.title}</Text>
                <Text style={styles.permDesc}>{perm.description}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <MaterialIcons name="lock" size={16} color={Colors.textSecondary} />
          <Text style={styles.noteText}>
            All transfers are encrypted with a per-session token and happen entirely on your local network. Your files never leave your device via the internet.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {requestingPermissions ? (
          <View style={styles.requestingContainer}>
            <ActivityIndicator color="white" size="small" />
            <Text style={styles.getStartedText}>Requesting Permissions...</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.getStartedButton}
            onPress={handleRequestAllPermissions}
            accessibilityRole="button"
            accessibilityLabel="Get started"
          >
            <Text style={styles.getStartedText}>Get Started</Text>
            <MaterialIcons name="arrow-forward" size={22} color="white" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingBottom: 120 },
  hero: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    gap: Spacing.md,
  },
  heroIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.primary,
    marginBottom: Spacing.md,
    elevation: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  heroTitle: {
    fontSize: FontSize.heading,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 320,
  },
  section: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: -Spacing.sm,
  },
  stepList: { gap: Spacing.sm },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: 'white', fontWeight: '800', fontSize: FontSize.md },
  stepText: { flex: 1, color: Colors.textPrimary, fontSize: FontSize.md },
  permRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'flex-start',
  },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  permInfo: { flex: 1 },
  permTitle: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.md },
  permDesc: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 3, lineHeight: 20 },
  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
  },
  noteText: { flex: 1, color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  requestingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md + 2,
    borderRadius: BorderRadius.round,
  },
  getStartedText: { color: 'white', fontWeight: '800', fontSize: FontSize.lg },
});
