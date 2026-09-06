// src/screens/OnboardingScreen.tsx
// Clean, minimal first-launch experience

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props { onComplete: () => void; }

export default function OnboardingScreen({ onComplete }: Props) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const handleGetStarted = () => {
    setBusy(true);
    setTimeout(() => onComplete(), 200);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image source={require('../../assets/flash-send-icon.png')} style={styles.logo} />
        <Text style={styles.title}>Flash Send</Text>
        <Text style={styles.subtitle}>Fast file sharing for Android</Text>
        
        <View style={styles.features}>
          <View style={styles.feature}>
            <MaterialIcons name="bolt" size={24} color={C.primary} />
            <Text style={styles.featureText}>No internet needed</Text>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="lock" size={24} color={C.primary} />
            <Text style={styles.featureText}>Completely private</Text>
          </View>
          <View style={styles.feature}>
            <MaterialIcons name="flash-on" size={24} color={C.primary} />
            <Text style={styles.featureText}>Lightning fast</Text>
          </View>
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + Spacing.md }]}>
        <TouchableOpacity style={styles.button} onPress={handleGetStarted} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? 'Starting...' : 'Get Started'}</Text>
          <MaterialIcons name="arrow-forward" size={22} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  logo: { width: 120, height: 120, borderRadius: 30, marginBottom: Spacing.xl },
  title: { fontSize: 36, fontFamily: FontFamily.extraBold, color: C.textPrimary, marginBottom: Spacing.xs },
  subtitle: { fontSize: 16, color: C.textSecondary, marginBottom: Spacing.xxl },
  features: { gap: Spacing.lg, width: '100%', maxWidth: 300 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  featureText: { fontSize: 16, color: C.textPrimary, fontFamily: FontFamily.medium },
  footer: { paddingHorizontal: Spacing.lg },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: BorderRadius.round,
    elevation: 4,
  },
  buttonText: { color: 'white', fontFamily: FontFamily.bold, fontSize: 17 },
});

