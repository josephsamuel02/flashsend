// src/networking/networkInfo.ts
// Utilities for getting local IP address on the device

import { Platform } from 'react-native';
import * as Network from 'expo-network';

export async function getLocalIPAddress(): Promise<string> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && ip !== '0.0.0.0' && ip !== '127.0.0.1') {
      return ip;
    }
  } catch (err) {
    console.warn('[Network] Failed to get IP via expo-network:', err);
  }
  return '0.0.0.0';
}

export async function isOnWiFi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    return state.type === Network.NetworkStateType.WIFI;
  } catch {
    return false;
  }
}
