declare module 'sendapp-native' {
  export interface InstalledApp {
    name: string;
    packageName: string;
    icon?: number;
    iconBase64?: string | null;
  }

  export function getAppApkPath(): string | null;
  export function getAppApkPathForPackage(packageName: string): string | null;
  export function getInstalledApps(): Promise<InstalledApp[]>;
  export function getAppIconBase64(packageName: string): string | null;
  export function copyApkToCache(packageName: string): Promise<string>;
  export function getFileSize(uri: string): number;
  export function getApkSize(packageName: string): number;
}

declare module 'flash-send-hotspot' {
  export interface HotspotCredentials {
    ssid: string;
    password: string;
  }
  export function isHotspotSupported(): boolean;
  export function startHotspot(): Promise<HotspotCredentials>;
  export function stopHotspot(): void;
}
