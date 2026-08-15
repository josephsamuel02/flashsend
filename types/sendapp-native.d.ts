declare module 'sendapp-native' {
  export interface InstalledApp {
    name: string;
    packageName: string;
    icon?: number;
  }

  export function getAppApkPath(): string | null;
  export function getAppApkPathForPackage(packageName: string): string | null;
  export function getInstalledApps(): Promise<InstalledApp[]>;
}
