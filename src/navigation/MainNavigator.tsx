// src/navigation/MainNavigator.tsx
// Tab navigation with swipeable material top tabs (Phase 3)

import React from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
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
import { useTransferStore } from '../store/transferStore';
import { Colors, Spacing, FontSize } from '../theme/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

function TabIcon({ name, focused }: { name: keyof typeof Feather.glyphMap; focused: boolean }) {
  return (
    <Feather
      name={name}
      size={19}
      color="white"
      style={{ opacity: focused ? 1 : 0.6 }}
    />
  );
}

function TabNavigator() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const sessionState = useTransferStore((s) => s.sessionState);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected';

  const handleSendPress = () => {
    navigation.navigate('Host');
  };

  const handleReceivePress = () => {
    if (isTransferActive) {
      navigation.navigate('Transfer');
    } else {
      navigation.navigate('Scan');
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Navigation Bar with Royal Blue — safe-area aware */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topBarContent}>
          <Image
            source={require('../../assets/flash-send-icon.png')}
            style={styles.logo}
            resizeMode="cover"
          />
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
            paddingTop: 4,
            paddingBottom: 2 + (insets.bottom > 0 ? 2 : 0),
            height: 52 + (insets.bottom > 0 ? insets.bottom - 4 : 0),
          },
          tabBarIndicatorStyle: {
            backgroundColor: 'white',
            height: 3,
            borderRadius: 2,
          },
          tabBarActiveTintColor: 'white',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
          tabBarLabelStyle: {
            fontSize: 9,
            fontFamily: 'Inter_700Bold',
            textTransform: 'uppercase',
            letterSpacing: 0.7,
            marginTop: 0,
          },
          tabBarItemStyle: {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            paddingVertical: 2,
          },
          tabBarScrollEnabled: false,
          swipeEnabled: true,
        }}
      >
        <Tab.Screen
          name="Apps"
          component={AppsTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="grid" focused={focused} /> }}
        />
        <Tab.Screen
          name="Photos"
          component={PhotosTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="image" focused={focused} /> }}
        />
        <Tab.Screen
          name="Videos"
          component={VideosTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="video" focused={focused} /> }}
        />
        <Tab.Screen
          name="Audio"
          component={AudioTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="music" focused={focused} /> }}
        />
        <Tab.Screen
          name="Files"
          component={FilesTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="folder" focused={focused} /> }}
        />
      </Tab.Navigator>

      <FloatingActionButtons
        onSendPress={handleSendPress}
        onReceivePress={handleReceivePress}
      />
    </View>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="Host"
        component={HostScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Scan"
        component={ScanScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="Transfer" component={TransferScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    backgroundColor: Colors.primary,
    paddingBottom: 12,
    paddingHorizontal: Spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: Spacing.md,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'white',
  },
});
