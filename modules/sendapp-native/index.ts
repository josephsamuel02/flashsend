import { requireNativeModule } from 'expo-modules-core';

export interface InstalledApp {
  name: string;
  packageName: string;
  icon?: number;
  iconBase64?: string | null;
}

interface SendappNativeModule {
  getAppApkPath(): string | null;
  getAppApkPathForPackage?(packageName: string): string | null;
  getInstalledApps(): Promise<InstalledApp[]>;
  getAppIconBase64?(packageName: string): string | null;
}

let nativeModule: SendappNativeModule | null = null;
try {
  nativeModule = requireNativeModule<SendappNativeModule>('SendappNative');
} catch (e) {
  console.warn('[sendapp-native] Native module not found - rebuild dev-client:', e);
}

export function getAppApkPath(): string | null {
  if (!nativeModule || typeof nativeModule.getAppApkPath !== 'function') {
    console.warn('[sendapp-native] getAppApkPath not available - rebuild dev-client');
    return null;
  }
  return nativeModule.getAppApkPath();
}

export function getAppApkPathForPackage(packageName: string): string | null {
  if (!nativeModule || typeof nativeModule.getAppApkPathForPackage !== 'function') {
    return null;
  }
  return nativeModule.getAppApkPathForPackage(packageName);
}

export function getInstalledApps(): Promise<InstalledApp[]> {
  if (!nativeModule || typeof nativeModule.getInstalledApps !== 'function') {
    return Promise.reject(
      new Error(
        'Native module SendappNative.getInstalledApps not available. You are likely running Expo Go or an old dev-client. Rebuild: npx expo prebuild --clean && npx expo run:android (or eas build --profile development).'
      )
    );
  }
  return nativeModule.getInstalledApps();
}

export function getAppIconBase64(packageName: string): string | null {
  if (!nativeModule || typeof (nativeModule as any).getAppIconBase64 !== 'function') {
    return null;
  }
  try {
    return (nativeModule as any).getAppIconBase64(packageName);
  } catch {
    return null;
  }
}
