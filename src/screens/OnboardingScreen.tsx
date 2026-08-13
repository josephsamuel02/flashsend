// src/screens/OnboardingScreen.tsx
// One-time onboarding screen explaining permissions before OS prompts fire (Phase 8)

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius } from '../theme/colors';

const PERMISSIONS = [
  {
    icon: 'photo-library' as const,
    title: 'Photo & Media Library',
    description: 'Access photos, videos, and audio files you want to share.',
  },
  {
    icon: 'camera-alt' as const,
    title: 'Camera',
    description: 'Scan the QR code displayed on the sending device to pair.',
  },
  {
    icon: 'wifi' as const,
    title: 'Local Network',
    description: 'Transfer files directly between devices on the same WiFi — no internet required.',
  },
  ...(Platform.OS === 'android' ? [{
    icon: 'notifications' as const,
    title: 'Notifications',
    description: 'Show transfer progress notifications while the app is in the background.',
  }] : []),
];

interface Props {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="send" size={52} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Welcome to SendApp</Text>
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
        <TouchableOpacity
          style={styles.getStartedButton}
          onPress={onComplete}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.getStartedText}>Get Started</Text>
          <MaterialIcons name="arrow-forward" size={22} color="white" />
        </TouchableOpacity>
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.sm,
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
