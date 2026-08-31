// src/screens/OnboardingScreen.tsx
// Xender-like first-launch experience, Android-only

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const PERMISSIONS = [
  {
    icon: 'photo-library' as const,
    title: 'Photos, Videos & Music',
    desc: 'Pick files you want to send. We never upload them — transfers stay on WiFi.',
  },
  {
    icon: 'camera-alt' as const,
    title: 'Camera',
    desc: 'Scan the sender QR to connect instantly. No typing.',
  },
  {
    icon: 'wifi-tethering' as const,
    title: 'WiFi & Hotspot',
    desc: 'Sender creates a hotspot automatically. Receiver joins with one tap. Needs Nearby Devices / Location on older Android.',
  },
  {
    icon: 'folder' as const,
    title: 'Files & Storage',
    desc: 'Browse any file type — APKs, PDFs, ZIPs. Saved files go to Flash Send folder & Gallery.',
  },
];

const STEPS = [
  { n: '1', icon: 'checklist' as const, text: 'Select files from Apps, Photos, Videos, Audio or Files' },
  { n: '2', icon: 'upload' as const, text: 'Tap Send → show QR to receiver' },
  { n: '3', icon: 'qr-code-scanner' as const, text: 'Receiver taps Receive → scans QR (auto-joins hotspot)' },
  { n: '4', icon: 'bolt' as const, text: 'Files fly over WiFi — 40–100 MB/s, no internet needed' },
];

interface Props { onComplete: () => void; }

export default function OnboardingScreen({ onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const handleGetStarted = async () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onComplete();
    }, 300);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + Spacing.lg }]} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={require('../../assets/flash-send-icon.png')} style={styles.heroLogo} />
          <Text style={styles.heroTitle}>Flash Send</Text>
          <View style={styles.heroBadge}>
            <MaterialIcons name="android" size={16} color={Colors.primary} />
            <Text style={styles.heroBadgeText}>For Android • Like Xender & SHAREit</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            No account. No cloud. No cables. Share APKs, photos, videos, music and any file between Android phones in seconds.
          </Text>
          <View style={styles.heroStats}>
            <View style={styles.stat}><MaterialIcons name="bolt" size={16} color={Colors.primary} /><Text style={styles.statText}>Up to 40 MB/s</Text></View>
            <View style={styles.stat}><MaterialIcons name="wifi-tethering" size={16} color={Colors.primary} /><Text style={styles.statText}>Hotspot auto</Text></View>
            <View style={styles.stat}><MaterialIcons name="lock" size={16} color={Colors.primary} /><Text style={styles.statText}>Private</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.steps}>
            {STEPS.map((s) => (
              <View key={s.n} style={styles.step}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{s.n}</Text></View>
                <View style={styles.stepIcon}><MaterialIcons name={s.icon} size={18} color={Colors.primary} /></View>
                <Text style={styles.stepText}>{s.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permissions we'll ask</Text>
          <Text style={styles.sectionSub}>Only when you first use each feature. You can deny and grant later in Settings.</Text>
          {PERMISSIONS.map((p) => (
            <View key={p.title} style={styles.permRow}>
              <View style={styles.permIcon}><MaterialIcons name={p.icon} size={22} color={Colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.permTitle}>{p.title}</Text>
                <Text style={styles.permDesc}>{p.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.note}>
          <MaterialIcons name="shield" size={18} color={Colors.success} />
          <Text style={styles.noteText}>
            Every transfer is protected by a one-time token. Files never touch the internet — only your two phones.
          </Text>
        </View>

        <View style={styles.androidNote}>
          <MaterialIcons name="info-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.androidNoteText}>Android only — hotspot is automatic on Android 8+. On Android 12 and below, enable Location when prompted for hotspot.</Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + Spacing.md }]}>
        <TouchableOpacity style={styles.cta} onPress={handleGetStarted} activeOpacity={0.88} disabled={busy}>
          <Text style={styles.ctaText}>{busy ? 'Starting…' : 'Get Started'}</Text>
          <MaterialIcons name="arrow-forward" size={22} color="white" />
        </TouchableOpacity>
        <Text style={styles.footerSub}>By continuing, you agree to use hotspot/WiFi for local transfers.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
  hero: { alignItems: 'center', gap: 12, paddingBottom: Spacing.lg },
  heroLogo: { width: 96, height: 96, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.surfaceBorder },
  heroTitle: { fontSize: 32, fontFamily: FontFamily.extraBold, color: Colors.textPrimary, letterSpacing: -0.5 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primaryGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  heroBadgeText: { color: Colors.primary, fontWeight: '700', fontSize: 12 },
  heroSubtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 340, fontFamily: FontFamily.regular },
  heroStats: { flexDirection: 'row', gap: Spacing.md, marginTop: 4 },
  stat: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.round,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'center',
  },
  statText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },
  section: { gap: 12, marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 18, fontFamily: FontFamily.bold, color: Colors.textPrimary },
  sectionSub: { fontSize: 13, color: Colors.textMuted, marginTop: -8, lineHeight: 18 },
  steps: { gap: Spacing.sm },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    elevation: 1,
  },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: 'white', fontWeight: '800', fontSize: 14 },
  stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryGlow, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, color: Colors.textPrimary, fontSize: 14, lineHeight: 20, fontFamily: FontFamily.medium },
  permRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    alignItems: 'flex-start',
  },
  permIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  permTitle: { color: Colors.textPrimary, fontFamily: FontFamily.bold, fontSize: 15 },
  permDesc: { color: Colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
  note: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.success,
    marginBottom: Spacing.md,
  },
  noteText: { flex: 1, color: Colors.textPrimary, fontSize: 13, lineHeight: 18, fontFamily: FontFamily.medium },
  androidNote: { flexDirection: 'row', gap: 8, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.surfaceBorder },
  androidNoteText: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 16 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
    gap: 8,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.round,
    elevation: 4,
  },
  ctaText: { color: 'white', fontFamily: FontFamily.bold, fontSize: 17 },
  footerSub: { textAlign: 'center', color: Colors.textMuted, fontSize: 11 },
});
