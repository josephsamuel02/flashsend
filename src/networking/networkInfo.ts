// src/networking/networkInfo.ts
// Android-optimized network utilities for Xender-like file sharing

import * as Network from 'expo-network';
import { Platform } from 'react-native';

// Common hotspot gateway IPs on Android
const HOTSPOT_FALLBACK_IPS = [
  '192.168.43.1',   // Default LocalOnlyHotspot gateway (most devices)
  '192.168.49.1',   // Some Samsung/OEM variant
  '192.168.137.1',  // Windows ICS/host variant fallback
  '192.168.0.1',
  '10.0.0.1',
];

function isValidIP(ip: string | null | undefined): boolean {
  if (!ip) return false;
  if (ip === '0.0.0.0' || ip === '127.0.0.1' || ip === '::1') return false;
  // Basic IPv4 check
  const parts = ip.split('.');
  if (parts.length === 4) {
    return parts.every(p => {
      const n = Number(p);
      return !isNaN(n) && n >= 0 && n <= 255;
    });
  }
  // Allow IPv6 but prefer IPv4
  return ip.includes(':') && ip.length > 5;
}

// Try to infer local IP using multiple strategies
export async function getLocalIPAddress(): Promise<string> {
  // Strategy 1: expo-network
  try {
    const ip = await Network.getIpAddressAsync();
    if (isValidIP(ip)) {
      console.log('[Network] IP via expo-network:', ip);
      return ip;
    } else {
      console.log('[Network] expo-network returned invalid:', ip);
    }
  } catch (err) {
    console.warn('[Network] expo-network failed:', err);
  }

  // Strategy 2: Try Network.getNetworkStateAsync subtype info
  try {
    const state: any = await Network.getNetworkStateAsync();
    // Some expo versions include ipAddress in state
    if (state?.ipAddress && isValidIP(state.ipAddress)) {
      console.log('[Network] IP via NetworkState:', state.ipAddress);
      return state.ipAddress;
    }
  } catch {}

  // Strategy 3: fallback to hotspot gateway probe
  // We cannot directly enumerate interfaces on Android via JS, so return most likely gateway
  // The HostScreen will after hotspot creation re-query, and we prefer 192.168.43.1
  // We'll try to detect if we're in hotspot mode by checking isOnHotspot heuristic
  console.warn('[Network] Falling back to hotspot gateway guess: 192.168.43.1');
  return '192.168.43.1';
}

// Returns true if device likely connected to WiFi or hotspot
export async function isOnWiFi(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync();
    // state.type can be WIFI, CELLULAR, ETHERNET, etc.
    // On Android hotspot, type is WIFI as well
    if (state.type === Network.NetworkStateType.WIFI && state.isConnected) return true;
    // Also consider if isConnected and isInternetReachable? But hotspot has no internet, so don't require internetReachable
    if (state.isConnected && Platform.OS === 'android') {
      // For hotspot case, isConnected true but type may still be WIFI
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Probe if a given IP is reachable by trying to fetch /ping
export async function probePeerReachable(ip: string, port: number, token: string, timeoutMs = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`http://${ip}:${port}/ping`, {
      method: 'GET',
      headers: { 'x-session-token': token },
      signal: controller.signal as any,
    });
    clearTimeout(timeout);
    return resp.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Get best IP to advertise in QR: try expo-network then fallbacks, and probe self-server
export async function getBestHostIP(port: number, token: string): Promise<string> {
  const primary = await getLocalIPAddress();
  if (await probePeerReachable(primary, port, token, 1500)) return primary;
  // Try fallback gateways if primary is unreachable (common after hotspot just created, DHCP not ready)
  for (const fallback of HOTSPOT_FALLBACK_IPS) {
    if (fallback === primary) continue;
    if (await probePeerReachable(fallback, port, token, 800)) {
      console.log('[Network] Fallback IP probed successfully:', fallback);
      return fallback;
    }
  }
  return primary; // return primary even if probe failed, QR still usable
}

export function isHotspotIP(ip: string): boolean {
  return ip.startsWith('192.168.43.') || ip.startsWith('192.168.49.') || ip.startsWith('192.168.137.');
}
