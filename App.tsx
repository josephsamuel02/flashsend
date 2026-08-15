// App.tsx - Root application component

import React, { useState, useEffect, useCallback } from 'react';
import { View, StatusBar, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';

import OnboardingScreen from './src/screens/OnboardingScreen';
import MainNavigator from './src/navigation/MainNavigator';
import HostScreen from './src/screens/HostScreen';
import ScanScreen from './src/screens/ScanScreen';
import TransferScreen from './src/screens/TransferScreen';
import { Colors } from './src/theme/colors';
import * as Updates from 'expo-updates';
import SpInAppUpdates, { IAUUpdateKind } from 'sp-react-native-in-app-updates';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createStackNavigator();
const ONBOARDED_KEY = '@sendapp:onboarded';

export default function App() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((val) => {
      setOnboarded(val === 'true');
    });

    if (!__DEV__) {
      checkForUpdates();
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) onLayoutReady();
  }, [fontsLoaded, fontError, onLayoutReady]);

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

  if (onboarded === null || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: Colors.background }} onLayout={onLayoutReady} />;
  }

  if (!onboarded) {
    return (
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={Colors.primary} translucent={false} />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: Colors.background }} onLayout={onLayoutReady}>
        <StatusBar barStyle="light-content" backgroundColor={Colors.primary} translucent={false} />
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
              options={{ presentation: 'modal' }}
            />
            <Stack.Screen name="Transfer" component={TransferScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}
