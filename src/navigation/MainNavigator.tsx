// src/navigation/MainNavigator.tsx
// Tab navigation with swipeable material top tabs (Phase 3)

import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

import AppsTab from '../screens/tabs/AppsTab';
import PhotosTab from '../screens/tabs/PhotosTab';
import VideosTab from '../screens/tabs/VideosTab';
import AudioTab from '../screens/tabs/AudioTab';
import FilesTab from '../screens/tabs/FilesTab';
import FloatingActionButtons from '../components/FloatingActionButtons';
import { useTransferStore } from '../store/transferStore';
import { Colors, Spacing, FontSize } from '../theme/colors';

const Tab = createMaterialTopTabNavigator();

function TabIcon({ name, focused }: { name: keyof typeof MaterialIcons.glyphMap; focused: boolean }) {
  return (
    <MaterialIcons
      name={name}
      size={22}
      color={focused ? Colors.primary : Colors.textMuted}
    />
  );
}

export default function MainNavigator() {
  const navigation = useNavigation() as any;
  const sessionState = useTransferStore((s) => s.sessionState);
  const isTransferActive = sessionState === 'hosting' || sessionState === 'connected';

  const handleSendPress = () => {
    if (isTransferActive) {
      navigation.navigate('Transfer');
    } else {
      navigation.navigate('Host');
    }
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
      <Tab.Navigator
        initialRouteName="Photos"
        screenOptions={{
          tabBarStyle: {
            backgroundColor: Colors.surface,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarIndicatorStyle: {
            backgroundColor: Colors.primary,
            height: 3,
            borderRadius: 2,
          },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
          tabBarLabelStyle: {
            fontSize: FontSize.xs,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          },
          tabBarScrollEnabled: false,
          swipeEnabled: true,
        }}
      >
        <Tab.Screen
          name="Apps"
          component={AppsTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="apps" focused={focused} /> }}
        />
        <Tab.Screen
          name="Photos"
          component={PhotosTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="photo-library" focused={focused} /> }}
        />
        <Tab.Screen
          name="Videos"
          component={VideosTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="videocam" focused={focused} /> }}
        />
        <Tab.Screen
          name="Audio"
          component={AudioTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="audiotrack" focused={focused} /> }}
        />
        <Tab.Screen
          name="Files"
          component={FilesTab}
          options={{ tabBarIcon: ({ focused }) => <TabIcon name="insert-drive-file" focused={focused} /> }}
        />
      </Tab.Navigator>

      <FloatingActionButtons
        onSendPress={handleSendPress}
        onReceivePress={handleReceivePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
