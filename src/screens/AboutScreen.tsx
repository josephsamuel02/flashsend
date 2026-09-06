// src/screens/AboutScreen.tsx
// About + Privacy Policy (moved here from Settings).

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';

export default function AboutScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About us</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Image source={require('../../assets/flash-send-icon.png')} style={styles.logo} resizeMode="cover" />
        <Text style={styles.appName}>Flash Send</Text>
        <Text style={styles.version}>Version 1.0.0</Text>
        <Text style={styles.tagline}>Fast, offline file sharing for Android. No internet needed.</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy Policy</Text>
          <Text style={styles.body}>
            Flash Send does not collect, store, or transmit your personal data to any server. All file
            transfers happen directly between your devices over a local WiFi hotspot.
          </Text>
          <Text style={styles.body}>
            Files you share never leave your local network. The app does not require an account and does
            not include analytics or advertising trackers.
          </Text>
          <Text style={styles.body}>
            Permissions such as Camera, Photos, Audio, Storage, and Nearby Devices are used only on your
            device to pick files, scan QR codes, and create hotspot connections. You can revoke any
            permission at any time in system Settings.
          </Text>
          <Text style={styles.body}>
            Received files are saved to the FlashSend folder on your device. Uninstalling the app removes
            app-private data; files saved to shared storage remain until you delete them.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.surfaceBorder,
  },
  backBtn: { padding: 8, marginLeft: -4, borderRadius: 20, backgroundColor: C.surfaceElevated },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: FontSize.xl, fontWeight: '700', color: C.textPrimary, fontFamily: FontFamily.bold },
  content: { padding: Spacing.lg, alignItems: 'center', gap: 8 },
  logo: { width: 84, height: 84, borderRadius: 20, backgroundColor: C.surfaceElevated },
  appName: { fontSize: 22, fontWeight: '800', color: C.textPrimary, fontFamily: FontFamily.bold, marginTop: 8 },
  version: { fontSize: 13, color: C.textMuted },
  tagline: { fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 12 },
  card: {
    width: '100%',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.textPrimary, fontFamily: FontFamily.bold },
  body: { fontSize: 14, color: C.textSecondary, lineHeight: 21 },
});
