import { requireNativeModule } from 'expo-modules-core';

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

interface SendappNativeModule {
  getAppApkPath(): string | null;
  getAppApkPathForPackage?(packageName: string): string | null;
  getInstalledApps(): Promise<InstalledApp[]>;
  getAppIconBase64?(packageName: string): string | null;
  copyApkToCache?(packageName: string): Promise<string>;
  getFileSize?(uri: string): number;
  getApkSize?(packageName: string): number;
  getStorageRoots?(): StorageRoot[];
  listDirectory?(path: string): Promise<FileEntry[]>;
  getFlashSendBaseDir?(): string | null;
  ensureFlashSendDirs?(): Promise<Record<string, string>>;
  getCategorizedSubfolder?(mimeType: string, fileName: string): string;
  getDestPathForFile?(mimeType: string, fileName: string): string | null;
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

export async function copyApkToCache(packageName: string): Promise<string> {
  if (!nativeModule || typeof (nativeModule as any).copyApkToCache !== 'function') {
    // Fallback to direct path (may fail on strict devices)
    const direct = getAppApkPathForPackage(packageName);
    if (direct) return direct;
    throw new Error('copyApkToCache not available - rebuild dev-client');
  }
  return (nativeModule as any).copyApkToCache(packageName);
}

export function getFileSize(uri: string): number {
  if (!nativeModule || typeof (nativeModule as any).getFileSize !== 'function') return 0;
  try { return (nativeModule as any).getFileSize(uri); } catch { return 0; }
}

export function getApkSize(packageName: string): number {
  if (!nativeModule || typeof (nativeModule as any).getApkSize !== 'function') return 0;
  try { return (nativeModule as any).getApkSize(packageName); } catch { return 0; }
}

export function getStorageRoots(): StorageRoot[] {
  if (!nativeModule || typeof (nativeModule as any).getStorageRoots !== 'function') return [];
  try { return (nativeModule as any).getStorageRoots(); } catch { return []; }
}

export function listDirectory(path: string): Promise<FileEntry[]> {
  if (!nativeModule || typeof (nativeModule as any).listDirectory !== 'function') {
    return Promise.reject(new Error('listDirectory not available - rebuild dev-client'));
  }
  return (nativeModule as any).listDirectory(path);
}

export function getFlashSendBaseDir(): string | null {
  if (!nativeModule || typeof (nativeModule as any).getFlashSendBaseDir !== 'function') return null;
  try { return (nativeModule as any).getFlashSendBaseDir(); } catch { return null; }
}

export async function ensureFlashSendDirs(): Promise<Record<string, string>> {
  if (!nativeModule || typeof (nativeModule as any).ensureFlashSendDirs !== 'function') return {};
  return (nativeModule as any).ensureFlashSendDirs();
}

export function getCategorizedSubfolder(mimeType: string, fileName: string): string {
  if (!nativeModule || typeof (nativeModule as any).getCategorizedSubfolder !== 'function') {
    // JS fallback
    const mime = (mimeType || '').toLowerCase();
    const name = (fileName || '').toLowerCase();
    const ext = name.split('.').pop() || '';
    if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','heic'].includes(ext)) return 'Images';
    if (mime.startsWith('video/') || ['mp4','mkv','avi','mov','wmv'].includes(ext)) return 'Videos';
    if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac'].includes(ext)) return 'Audio';
    if (mime === 'application/vnd.android.package-archive' || ext === 'apk') return 'Apps';
    if (['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','zip','rar'].includes(ext)) return 'Documents';
    return 'Files';
  }
  try { return (nativeModule as any).getCategorizedSubfolder(mimeType, fileName); } catch { return 'Files'; }
}

export function getDestPathForFile(mimeType: string, fileName: string): string | null {
  if (!nativeModule || typeof (nativeModule as any).getDestPathForFile !== 'function') return null;
  try { return (nativeModule as any).getDestPathForFile(mimeType, fileName); } catch { return null; }
}

export async function shareFileToApp(fileUri: string, mimeType: string, packageName: string): Promise<boolean> {
  if (!nativeModule || typeof (nativeModule as any).shareFileToApp !== 'function') {
    throw new Error('shareFileToApp not available - rebuild dev-client');
  }
  return (nativeModule as any).shareFileToApp(fileUri, mimeType, packageName);
}
