import { requireNativeModule } from 'expo-modules-core';

interface SendappNativeModule {
  getAppApkPath(): string | null;
}

const module = requireNativeModule<SendappNativeModule>('SendappNative');

export function getAppApkPath(): string | null {
  return module.getAppApkPath();
}
