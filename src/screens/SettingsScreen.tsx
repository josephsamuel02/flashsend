// src/screens/SettingsScreen.tsx
// Minimal settings: permissions list + auto-refresh toggle. No diagnostics, no explanations.

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  FlatList,
  Platform,
  PermissionsAndroid,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { useCameraPermissions } from 'expo-camera';
import { useColors, type ThemeColors, Spacing, FontSize, BorderRadius, FontFamily } from '../theme/colors';
import { useSettingsStore } from '../store/settingsStore';
import {
  hasStatusAccess,
  openAllFilesAccessSettings,
  pickStatusFolder,
} from '../lib/statusAccess';

type PermItem = {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  check: () => Promise<boolean>;
  request: () => Promise<boolean>;
};

export default function SettingsScreen() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const autoRefresh = useSettingsStore((s) => s.autoRefresh);
  const setAutoRefresh = useSettingsStore((s) => s.setAutoRefresh);
  const waStatus = useSettingsStore((s) => s.waStatus);
  const setWaStatus = useSettingsStore((s) => s.setWaStatus);
  const waBusinessStatus = useSettingsStore((s) => s.waBusinessStatus);
  const setWaBusinessStatus = useSettingsStore((s) => s.setWaBusinessStatus);
  const [mediaPerm, requestMediaPerm] = MediaLibrary.usePermissions();
  const [cameraPerm, requestCameraPerm] = useCameraPermissions();
  const [statuses, setStatuses] = useState<Record<string, boolean>>({});

  const checkMedia = useCallback(async () => !!mediaPerm?.granted, [mediaPerm]);
  const checkCamera = useCallback(async () => !!cameraPerm?.granted, [cameraPerm]);

  const checkLocation = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const api = Platform.Version as number;
      if (api >= 33) {
        const r = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES as any
        );
        return r;
      }
      const r = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return r;
    } catch {
      return false;
    }
  }, []);

  const checkStorage = useCallback(async () => {
    if (Platform.OS !== 'android') return true;
    try {
      const api = Platform.Version as number;
      if (api >= 33) {
        const img = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES as any
        );
        return img;
      }
      const r = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as any
      );
      return r;
    } catch {
      return false;
    }
  }, []);

  const requestLocation = useCallback(async () => {
    try {
      const api = Platform.Version as number;
      const perm =
        api >= 33
          ? PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES
          : PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      const res = await PermissionsAndroid.request(perm as any);
      return res === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  const requestStorage = useCallback(async () => {
    try {
      const api = Platform.Version as number;
      if (api >= 33) {
        const res = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES as string,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO as string,
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO as string,
        ] as any);
        return Object.values(res).some((v) => v === PermissionsAndroid.RESULTS.GRANTED);
      }
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE as any
      );
      return res === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  const items: PermItem[] = [
    {
      id: 'camera',
      name: 'Camera',
      icon: 'camera-alt',
      check: checkCamera,
      request: async () => {
        const r = await requestCameraPerm();
        return r.granted;
      },
    },
    {
      id: 'photos',
      name: 'Photos & Videos',
      icon: 'photo-library',
      check: checkMedia,
      request: async () => {
        const r = await requestMediaPerm();
        return r.granted;
      },
    },
    {
      id: 'audio',
      name: 'Music & Audio',
      icon: 'library-music',
      check: checkMedia,
      request: async () => {
        const r = await requestMediaPerm();
        return r.granted;
      },
    },
    {
      id: 'files',
      name: 'Files & Storage',
      icon: 'folder',
      check: checkStorage,
      request: requestStorage,
    },
    {
      id: 'nearby',
      name: 'Nearby Devices / Location',
      icon: 'wifi',
      check: checkLocation,
      request: requestLocation,
    },
  ];

  const refreshStatuses = useCallback(async () => {
    const next: Record<string, boolean> = {};
    for (const it of items) {
      try {
        next[it.id] = await it.check();
      } catch {
        next[it.id] = false;
      }
    }
    setStatuses(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaPerm?.granted, cameraPerm?.granted]);

  useFocusEffect(
    useCallback(() => {
      refreshStatuses();
    }, [refreshStatuses])
  );

  const handleRowPress = async (item: PermItem) => {
    const granted = await item.request();
    if (!granted) {
      Linking.openSettings().catch(() => {});
    }
    refreshStatuses();
  };

  const handleStatusToggle = async (which: 'wa' | 'business', v: boolean) => {
    if (which === 'wa') setWaStatus(v);
    else setWaBusinessStatus(v);
    if (!v) return;
    try {
      if (!(await hasStatusAccess())) {
        await openAllFilesAccessSettings();
        return;
      }
      await pickStatusFolder();
    } catch {}
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item }) => {
          const granted = statuses[item.id];
          return (
            <TouchableOpacity style={styles.row} onPress={() => handleRowPress(item)} activeOpacity={0.8}>
              <View style={styles.iconBox}>
                <MaterialIcons name={item.icon} size={20} color={C.primary} />
              </View>
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={[styles.status, granted ? styles.granted : styles.denied]}>
                {granted ? 'Granted' : 'Denied'}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color={C.textMuted} />
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={{ gap: 8, marginTop: 8 }}>
            <View style={styles.toggleRow}>
              <View style={styles.iconBox}>
                <MaterialIcons name="folder" size={20} color="#1DA851" />
              </View>
              <Text style={styles.rowName}>WhatsApp Status</Text>
              <Switch
                value={waStatus}
                onValueChange={(v) => handleStatusToggle('wa', v)}
                trackColor={{ false: C.surfaceBorder, true: C.primary }}
                thumbColor="white"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.iconBox}>
                <MaterialIcons name="folder" size={20} color="#0E7C6B" />
              </View>
              <Text style={styles.rowName}>WhatsApp Business Status</Text>
              <Switch
                value={waBusinessStatus}
                onValueChange={(v) => handleStatusToggle('business', v)}
                trackColor={{ false: C.surfaceBorder, true: C.primary }}
                thumbColor="white"
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.iconBox}>
                <MaterialIcons name="refresh" size={20} color={C.primary} />
              </View>
              <Text style={styles.rowName}>Auto-refresh</Text>
              <Switch
                value={autoRefresh}
                onValueChange={setAutoRefresh}
                trackColor={{ false: C.surfaceBorder, true: C.primary }}
                thumbColor="white"
              />
            </View>
          </View>
        }
      />
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
  list: { padding: Spacing.md, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  rowName: { flex: 1, color: C.textPrimary, fontSize: FontSize.md, fontWeight: '600' },
  status: { fontSize: 12, fontWeight: '700' },
  granted: { color: C.success },
  denied: { color: C.error },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
});
