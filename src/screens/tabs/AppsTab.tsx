// src/screens/tabs/AppsTab.tsx
// Placeholder for the Apps tab — awaiting confirmation from Samuel (Phase 3 note)
// Currently displays a "Coming Soon" UI explaining the scope decision needed

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { getAppApkPath } from 'sendapp-native';
import { Colors, Spacing, FontSize, BorderRadius } from '../../theme/colors';

export default function AppsTab() {
  const handleShareApp = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'App sharing is only available on Android.');
      return;
    }

    try {
      const apkPath = getAppApkPath();
      if (!apkPath) {
        Alert.alert('Error', 'Could not locate the application file.');
        return;
      }
      
      const fileUri = `file://${apkPath}`;
      const isAvailable = await Sharing.isAvailableAsync();
      
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device.');
        return;
      }
      
      // Copy to cache directory so other apps can read it
      const tempPath = `${FileSystem.cacheDirectory}SendApp.apk`;
      await FileSystem.copyAsync({
        from: fileUri,
        to: tempPath
      });

      await Sharing.shareAsync(tempPath, {
        mimeType: 'application/vnd.android.package-archive',
        dialogTitle: 'Share SendApp via Bluetooth',
      });
    } catch (err: any) {
      console.error(err);
      Alert.alert('Error', 'Failed to share the app: ' + err.message);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <MaterialIcons name="share" size={56} color={Colors.primary} />
      </View>
      <Text style={styles.title}>Share SendApp</Text>
      
      <Text style={styles.description}>
        Share this app directly with nearby friends via Bluetooth or nearby share, so they can install it and send files to you.
      </Text>

      <TouchableOpacity 
        style={styles.shareButton} 
        onPress={handleShareApp}
        activeOpacity={0.8}
      >
        <MaterialIcons name="bluetooth" size={24} color="white" />
        <Text style={styles.shareButtonText}>Share via OS</Text>
      </TouchableOpacity>

      <View style={styles.noteCard}>
        <MaterialIcons name="info" size={16} color={Colors.textSecondary} />
        <Text style={styles.noteText}>
          Requires "Install from unknown sources" to be enabled on the receiving Android device.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primaryGlow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    maxWidth: 300,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md + 4,
    borderRadius: BorderRadius.round,
    marginBottom: Spacing.xxl,
    elevation: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  shareButtonText: {
    color: 'white',
    fontSize: FontSize.lg,
    fontWeight: '700',
  },
  noteCard: {
    flexDirection: 'row',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'flex-start',
    width: '100%',
  },
  noteText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
});
