// src/navigation/MainNavigator.tsx
// Android-optimized navigation with Xender-like tabs and top bar

import React from 'react';
import { View, StyleSheet, Text, Image, Pressable } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { createStackNavigator } from '@react-navigation/stack';

import AppsTab from '../screens/tabs/AppsTab';
import PhotosTab from '../screens/tabs/PhotosTab';
import VideosTab from '../screens/tabs/VideosTab';
import AudioTab from '../screens/tabs/AudioTab';
import FilesTab from '../screens/tabs/FilesTab';
import FloatingActionButtons from '../components/FloatingActionButtons';
import HostScreen from '../screens/HostScreen';
import ScanScreen from '../screens/ScanScreen';
import TransferScreen from '../screens/TransferScreen';
import { useSelectionStore } from '../store/selectionStore';
import { useTransferStore } from '../store/transferStore';
import { Colors, Spacing, FontSize } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function TabIcon({ name, focused, badge }: { name: keyof typeof Feather.glyphMap; focused: boolean; badge?: number }) {
  return (
    <View style={styles.tabIconWrap}>
      <Feather name={name} size={20} color="white" style={{ opacity: focused ? 1 : 0.72 }} />
      {badge ? <TabBadge count={badge} /> : null}
    </View>
  );
}

function TabNavigator() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const sessionState = useTransferStore((s) => s.sessionState);
  const selectedFiles = useSelectionStore((s) => s.selectedFiles);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected' || sessionState === 'done';
  const totalSelected = Object.keys(selectedFiles).length;
  const totalByTab = {
    Apps: Object.values(selectedFiles).filter((f) => f.tab === 'Apps').length,
    Photos: Object.values(selectedFiles).filter((f) => f.tab === 'Photos').length,
    Videos: Object.values(selectedFiles).filter((f) => f.tab === 'Videos').length,
    Audio: Object.values(selectedFiles).filter((f) => f.tab === 'Audio').length,
    Files: Object.values(selectedFiles).filter((f) => f.tab === 'Files').length,
  };

  const handleSendPress = () => {
    navigation.navigate('Host');
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
          <Image source={require('../../assets/flash-send-icon.png')} style={styles.logo} resizeMode="cover" />
          <View style={styles.brandWrap}>
            <Text style={styles.brandTitle}>Flash Send</Text>
            <Text style={styles.brandSub}>Android • WiFi Direct • No Internet Needed</Text>
          </View>
          {totalSelected > 0 && (
            <View style={styles.selectedPill}>
              <MaterialIcons name="check-circle" size={16} color={Colors.primary} />
              <Text style={styles.selectedPillText}>{totalSelected}</Text>
            </View>
          )}
          {isTransferActive && (
            <Pressable onPress={() => navigation.navigate('Transfer')} style={styles.transferPill}>
              <View style={styles.liveDot} />
              <Text style={styles.transferPillText}>Transfer</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Tab.Navigator
        initialRouteName="Apps"
        screenOptions={{
          tabBarStyle: {
            backgroundColor: Colors.primary,
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
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: {
    backgroundColor: Colors.primary,
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
  selectedPillText: { color: Colors.primary, fontWeight: '800', fontSize: 13 },
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
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00E676' },
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
    borderColor: Colors.primary,
    elevation: 1,
  },
  badgeText: { color: Colors.primary, fontSize: 10, fontWeight: '800', lineHeight: 12 },
});
