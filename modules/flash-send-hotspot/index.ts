import { requireNativeModule } from 'expo-modules-core';

export interface HotspotCredentials {
  ssid: string;
  password: string;
}

interface FlashSendHotspotModule {
  startHotspot(): Promise<HotspotCredentials>;
  stopHotspot(): void;
  isHotspotSupported(): boolean;
}

let nativeModule: FlashSendHotspotModule | null = null;
try {
  nativeModule = requireNativeModule<FlashSendHotspotModule>('FlashSendHotspot');
} catch (e) {
  console.warn('[flash-send-hotspot] Native module not found - rebuild dev-client:', e);
}

export function isHotspotSupported(): boolean {
  if (!nativeModule || typeof nativeModule.isHotspotSupported !== 'function') return false;
  try {
    return nativeModule.isHotspotSupported();
  } catch {
    return false;
  }
}

export function startHotspot(): Promise<HotspotCredentials> {
  if (!nativeModule || typeof nativeModule.startHotspot !== 'function') {
    return Promise.reject(
      new Error(
        'Hotspot module not available. Rebuild dev-client: npx expo prebuild --clean && npx expo run:android'
      )
    );
  }
  return nativeModule.startHotspot();
}

export function stopHotspot(): void {
  if (!nativeModule || typeof nativeModule.stopHotspot !== 'function') return;
  try {
    nativeModule.stopHotspot();
  } catch {}
}
