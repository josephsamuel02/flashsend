// src/navigation/MainNavigator.tsx
// Android-optimized navigation with Xender-like tabs and top bar

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Image, Pressable, TouchableOpacity, Modal } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { createStackNavigator } from '@react-navigation/stack';

import AppsTab from '../screens/tabs/AppsTab';
import PhotosTab from '../screens/tabs/PhotosTab';
import VideosTab from '../screens/tabs/VideosTab';
import AudioTab from '../screens/tabs/AudioTab';
import FilesTab from '../screens/tabs/FilesTab';
import StatusTab from '../screens/tabs/StatusTab';
import FloatingActionButtons from '../components/FloatingActionButtons';
import HostScreen from '../screens/HostScreen';
import ScanScreen from '../screens/ScanScreen';
import TransferScreen from '../screens/TransferScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AboutScreen from '../screens/AboutScreen';
import MediaViewerScreen from '../screens/MediaViewerScreen';
import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { useSettingsStore } from '../store/settingsStore';
import { useColors, type ThemeColors, Spacing, FontSize } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

function TabBadge({ count }: { count: number }) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function TabIcon({ name, focused, badge }: { name: keyof typeof Feather.glyphMap; focused: boolean; badge?: number }) {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  return (
    <View style={styles.tabIconWrap}>
      <Feather name={name} size={20} color="white" style={{ opacity: focused ? 1 : 0.72 }} />
      {badge ? <TabBadge count={badge} /> : null}
    </View>
  );
}

function TabNavigator() {
  const C = useColors();
  const styles = React.useMemo(() => getStyles(C), [C]);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const sessionState = useTransferStore((s) => s.sessionState);
  const session = useTransferStore((s) => s.session);
  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const { addFiles } = useTransferStore();
  const { clearSelection } = useSelectionStore();
  const loadSettings = useSettingsStore((s) => s.load);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const [menuVisible, setMenuVisible] = useState(false);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected' || sessionState === 'done';
  const totalSelected = Object.keys(selectedFiles).length;
  const totalByTab = {
    Apps: Object.values(selectedFiles).filter((f) => f.tab === 'Apps').length,
    Photos: Object.values(selectedFiles).filter((f) => f.tab === 'Photos').length,
    Videos: Object.values(selectedFiles).filter((f) => f.tab === 'Videos').length,
    Audio: Object.values(selectedFiles).filter((f) => f.tab === 'Audio').length,
    Files: Object.values(selectedFiles).filter((f) => f.tab === 'Files').length,
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSendPress = async () => {
    // If transfer is active and we have a peer connection, upload selected files
    if (isTransferActive && session?.peerIP && session?.peerPort && totalSelected > 0) {
      const { Alert } = require('react-native');
      const { uploadAllFiles } = require('../networking/client');
      
      Alert.alert(
        'Send to Connected Device',
        `Send ${totalSelected} selected file(s) to the connected device?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            onPress: async () => {
              const filesToUpload = Object.values(selectedFiles);
              
              // Add to transfer store
              const transferFiles = filesToUpload.map((f: any) => ({
                id: f.id,
                name: f.name,
                size: f.size || 0,
                mimeType: f.mimeType,
                direction: 'outgoing' as const,
                localUri: f.uri,
              }));
              addFiles(transferFiles);
              
              // Navigate to transfer screen to show progress
              navigation.navigate('Transfer');
              
              // Upload to peer
              try {
                const peer = {
                  ip: session.peerIP!,
                  port: session.peerPort!,
                  token: session.token,
                };
                await uploadAllFiles(peer, filesToUpload.map((f: any) => ({
                  id: f.id,
                  name: f.name,
                  uri: f.uri,
                  size: f.size || 0,
                  mimeType: f.mimeType,
                })));
                clearSelection();
                Alert.alert('Success', `Sent ${filesToUpload.length} file(s)!`);
              } catch (err: any) {
                Alert.alert('Upload Failed', err?.message || 'Could not send files');
              }
            },
          },
        ]
      );
    } else {
      // Normal behavior: navigate to Host screen to start new transfer
      navigation.navigate('Host');
    }
  };

  const handleReceivePress = () => {
    if (isTransferActive) navigation.navigate('Transfer');
    else navigation.navigate('Scan');
  };

  return (
    <View style={styles.container}>
      {/* Top Branding Bar — Xender style */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topBarContent}>
          <TouchableOpacity
            onPress={() => setDarkMode(!darkMode)}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name={darkMode ? 'light-mode' : 'dark-mode'} size={22} color="white" />
          </TouchableOpacity>
          <Image source={require('../../assets/flash-send-icon.png')} style={styles.logo} resizeMode="cover" />
          <View style={styles.brandWrap}>
            <Text style={styles.brandTitle}>Flash Send</Text>
            <Text style={styles.brandSub}>Android • WiFi Direct • No Internet Needed</Text>
          </View>
          {totalSelected > 0 && (
            <View style={styles.selectedPill}>
              <MaterialIcons name="check-circle" size={16} color={C.primary} />
              <Text style={styles.selectedPillText}>{totalSelected}</Text>
            </View>
          )}
          {isTransferActive && (
            <Pressable onPress={() => navigation.navigate('Transfer')} style={styles.transferPill}>
              <View style={styles.liveDot} />
              <Text style={styles.transferPillText}>Transfer</Text>
            </Pressable>
          )}
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            style={styles.menuBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MaterialIcons name="more-vert" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View style={[styles.menuBox, { top: insets.top + 56 }]}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('Settings');
              }}
            >
              <MaterialIcons name="settings" size={20} color={C.textPrimary} />
              <Text style={styles.menuText}>Settings</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('About');
              }}
            >
              <MaterialIcons name="info-outline" size={20} color={C.textPrimary} />
              <Text style={styles.menuText}>About us</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <Tab.Navigator
        initialRouteName="Apps"
        screenOptions={{
          tabBarStyle: {
            backgroundColor: C.primary,
            elevation: 0,
            shadowOpacity: 0,
            borderTopWidth: 0,
            paddingTop: 2,
            height: 56,
          },
          tabBarIndicatorStyle: {
            backgroundColor: 'white',
            height: 3,
            borderRadius: 2,
            marginBottom: 0,
          },
          tabBarActiveTintColor: 'white',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.78)',
          tabBarLabelStyle: {
            fontSize: 10,
            fontFamily: 'Inter_700Bold',
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginTop: 2,
          },
          tabBarItemStyle: {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 4,
          },
          tabBarScrollEnabled: false,
          swipeEnabled: true,
          lazy: true,
        }}
      >
        <Tab.Screen
          name="Status"
          component={StatusTab}
          options={{
            tabBarLabel: 'Status',
            tabBarIcon: ({ focused }) => <TabIcon name="message-circle" focused={focused} />,
          }}
        />
        <Tab.Screen
          name="Apps"
          component={AppsTab}
          options={{
            tabBarLabel: 'Apps',
            tabBarIcon: ({ focused }) => <TabIcon name="grid" focused={focused} badge={totalByTab.Apps} />,
          }}
        />
        <Tab.Screen
          name="Photos"
          component={PhotosTab}
          options={{
            tabBarLabel: 'Photos',
            tabBarIcon: ({ focused }) => <TabIcon name="image" focused={focused} badge={totalByTab.Photos} />,
          }}
        />
        <Tab.Screen
          name="Videos"
          component={VideosTab}
          options={{
            tabBarLabel: 'Videos',
            tabBarIcon: ({ focused }) => <TabIcon name="video" focused={focused} badge={totalByTab.Videos} />,
          }}
        />
        <Tab.Screen
          name="Audio"
          component={AudioTab}
          options={{
            tabBarLabel: 'Audio',
            tabBarIcon: ({ focused }) => <TabIcon name="music" focused={focused} badge={totalByTab.Audio} />,
          }}
        />
        <Tab.Screen
          name="Files"
          component={FilesTab}
          options={{
            tabBarLabel: 'Files',
            tabBarIcon: ({ focused }) => <TabIcon name="folder" focused={focused} badge={totalByTab.Files} />,
          }}
        />
      </Tab.Navigator>

      <FloatingActionButtons onSendPress={handleSendPress} onReceivePress={handleReceivePress} />
    </View>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen name="Host" component={HostScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Transfer" component={TransferScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="MediaViewer" component={MediaViewerScreen} options={{ gestureEnabled: true }} />
    </Stack.Navigator>
  );
}

const getStyles = (C: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  topBar: {
    backgroundColor: C.primary,
    paddingBottom: 10,
    paddingHorizontal: Spacing.md,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    zIndex: 10,
  },
  topBarContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  logo: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'white' },
  brandWrap: { flex: 1 },
  brandTitle: { color: 'white', fontFamily: 'Outfit_800ExtraBold', fontSize: 18, letterSpacing: 0.2 },
  brandSub: { color: 'rgba(255,255,255,0.88)', fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 1 },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
    elevation: 2,
  },
  selectedPillText: { color: C.primary, fontWeight: '800', fontSize: 13 },
  transferPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1.5,
    borderColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 100,
  },
  transferPillText: { color: 'white', fontWeight: '700', fontSize: 12 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#12B76A' },
  menuBtn: { padding: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)' },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  menuBox: {
    position: 'absolute',
    right: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    minWidth: 180,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  menuText: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  menuDivider: { height: 1, backgroundColor: C.surfaceBorder },
  tabIconWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -8,
    right: -14,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: C.primary,
    elevation: 1,
  },
  badgeText: { color: C.primary, fontSize: 10, fontWeight: '800', lineHeight: 12 },
});
