// App.tsx - Root application component

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import OnboardingScreen from './src/screens/OnboardingScreen';
import MainNavigator from './src/navigation/MainNavigator';
import HostScreen from './src/screens/HostScreen';
import ScanScreen from './src/screens/ScanScreen';
import TransferScreen from './src/screens/TransferScreen';
import { Colors } from './src/theme/colors';
import * as Updates from 'expo-updates';
import SpInAppUpdates, { IAUUpdateKind } from 'sp-react-native-in-app-updates';
import { Platform } from 'react-native';

const Stack = createStackNavigator();
const ONBOARDED_KEY = '@sendapp:onboarded';

export default function App() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((val) => {
      setOnboarded(val === 'true');
    });

    if (!__DEV__) {
      checkForUpdates();
    }
  }, []);

  const checkForUpdates = async () => {
    try {
      // 1. JS Updates (Silent background update)
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        await Updates.fetchUpdateAsync();
        // The update will apply on the next app restart
      }

      // 2. Native Play Store Updates (Android)
      if (Platform.OS === 'android') {
        const inAppUpdates = new SpInAppUpdates(false);
        inAppUpdates.checkNeedsUpdate().then((result) => {
          if (result.shouldUpdate) {
            inAppUpdates.startUpdate({
              updateType: IAUUpdateKind.FLEXIBLE, // flexible = background download
            });
          }
        }).catch(() => {}); // ignore errors silently
      }
    } catch (e) {
      console.warn('[Updates]', e);
    }
  };

  const handleOnboardingComplete = async () => {
    await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
    setOnboarded(true);
  };

  if (onboarded === null) {
    // Loading state — transparent while AsyncStorage loads
    return <View style={{ flex: 1, backgroundColor: Colors.background }} />;
  }

  if (!onboarded) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={Colors.surface} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainNavigator} />
          <Stack.Screen
            name="Host"
            component={HostScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="Scan"
            component={ScanScreen}
            options={{ presentation: 'fullScreenModal' }}
          />
          <Stack.Screen name="Transfer" component={TransferScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}
