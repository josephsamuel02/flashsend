declare module 'sendapp-native' {
  export interface InstalledApp {
    name: string;
    packageName: string;
    icon?: number;
    iconBase64?: string | null;
    isSystemApp?: boolean;
  }

  export interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    mimeType: string;
    modified: number;
    extension: string;
    childCount: number;
    readable: boolean;
    hidden: boolean;
  }

  export interface StorageRoot {
    name: string;
    path: string;
    type: string;
    readable: boolean;
    writable: boolean;
  }

  export function getAppApkPath(): string | null;
  export function getAppApkPathForPackage(packageName: string): string | null;
  export function getInstalledApps(): Promise<InstalledApp[]>;
  export function getAppIconBase64(packageName: string): string | null;
  export function copyApkToCache(packageName: string): Promise<string>;
  export function getFileSize(uri: string): number;
  export function getApkSize(packageName: string): number;
  export function getStorageRoots(): StorageRoot[];
  export function listDirectory(path: string): Promise<FileEntry[]>;
  export function getFlashSendBaseDir(): string | null;
  export function ensureFlashSendDirs(): Promise<Record<string, string>>;
  export function getCategorizedSubfolder(mimeType: string, fileName: string): string;
  export function getDestPathForFile(mimeType: string, fileName: string): string | null;
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
