// src/lib/statusAccess.ts
// WhatsApp status folder access: all-files settings deep link + SAF folder picker,
// direct .Statuses scanning, single-file gallery save. Minimal, no UI text here.

import { Platform, PermissionsAndroid, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { listDirectory } from 'sendapp-native';

export interface StatusItem {
  id: string;
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  mtime: number | null;
  source: 'wa' | 'business';
  isSAF: boolean;
}

const WA_PATHS = [
  '/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/.Statuses',
  '/storage/emulated/0/WhatsApp/Media/.Statuses',
  '/sdcard/WhatsApp/Media/.Statuses',
  '/sdcard/Android/media/com.whatsapp/WhatsApp/Media/.Statuses',
];

const BUSINESS_PATHS = [
  '/storage/emulated/0/Android/media/com.whatsapp.w4b/WhatsApp Business/Media/.Statuses',
  '/storage/emulated/0/WhatsApp Business/Media/.Statuses',
];

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic']);
const VIDEO_EXT = new Set(['mp4', '3gp', 'mkv', 'mov', 'avi', 'webm']);

const apiLevel = (): number =>
  Platform.OS === 'android'
    ? typeof Platform.Version === 'number'
      ? Platform.Version
      : parseInt(String(Platform.Version), 10)
    : 0;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function classify(name: string): 'image' | 'video' | null {
  const ext = extOf(name);
  if (IMAGE_EXT.has(ext)) return 'image';
  if (VIDEO_EXT.has(ext)) return 'video';
  return null;
}

function isIgnored(name: string): boolean {
  return !name || name.startsWith('.') || name === 'Thumbs.db';
}

// ─── Access checks ────────────────────────────────────────────────────────────

export async function hasMediaAccess(): Promise<boolean> {
  try {
    const p = await MediaLibrary.getPermissionsAsync();
    return !!p.granted;
  } catch {
    return false;
  }
}

// Media permission prompt used by the Status "Get WhatsApp Status" button and
// the first-open prompt. Requests read access to images/video/audio.
export async function requestStatusMediaAccess(): Promise<boolean> {
  try {
    const p = await MediaLibrary.requestPermissionsAsync();
    return !!p.granted;
  } catch {
    return false;
  }
}

async function probeDirectAccess(): Promise<boolean> {
  const candidates = [...WA_PATHS, ...BUSINESS_PATHS];
  for (const p of candidates) {
    try {
      await listDirectory(p);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function hasAllFilesAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    if (apiLevel() >= 30) {
      try {
        const ok = await PermissionsAndroid.check(
          'android.permission.MANAGE_EXTERNAL_STORAGE' as any
        );
        if (ok) return true;
      } catch {}
      return await probeDirectAccess();
    }
    return await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
  } catch {
    return false;
  }
}

const SAF = (FileSystem as any)?.StorageAccessFramework;

export async function hasSAFAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (!SAF?.getUriPermissionsAsync) return false;
    const perms = await SAF.getUriPermissionsAsync();
    return Array.isArray(perms) && perms.length > 0;
  } catch {
    return false;
  }
}

export async function hasStatusAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // Media access is the primary path (Play-safe, no all-files needed).
  try {
    if (await hasMediaAccess()) return true;
  } catch {}
  try {
    if (await hasAllFilesAccess()) return true;
  } catch {}
  try {
    return await hasSAFAccess();
  } catch {
    return false;
  }
}

// ─── System prompts ───────────────────────────────────────────────────────────

// "Get Status" target: the system All-files-access page (falls back to app settings).
export async function openAllFilesAccessSettings(): Promise<void> {
  try {
    const sendIntent = (Linking as any)?.sendIntent;
    if (Platform.OS === 'android' && typeof sendIntent === 'function') {
      await sendIntent('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
      return;
    }
  } catch {}
  try {
    await Linking.openSettings();
  } catch {}
}

// SAF folder picker (Play-safe path). Returns true when a folder was granted.
export async function pickStatusFolder(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    if (!SAF?.requestDirectoryPermissionsAsync) return false;
    const res = await SAF.requestDirectoryPermissionsAsync();
    return !!(res?.granted && res?.directoryUri);
  } catch {
    return false;
  }
}

// ─── Listing ──────────────────────────────────────────────────────────────────

function labelForSAFUri(uri: string): 'wa' | 'business' {
  let s = uri;
  try {
    s = decodeURIComponent(uri);
  } catch {}
  return /w4b|business/i.test(s) ? 'business' : 'wa';
}

function safName(uri: string): string {
  try {
    const last = uri.split('/').pop() || uri;
    let d = last;
    try {
      d = decodeURIComponent(last);
    } catch {}
    if (d.includes(':')) {
      const p = d.split(':');
      d = p[p.length - 1];
    }
    if (d.includes('/')) {
      const p = d.split('/');
      d = p[p.length - 1];
    }
    return d || last;
  } catch {
    return uri;
  }
}

async function listSAFDir(dirUri: string, depth: number): Promise<string[]> {
  if (depth < 0 || !SAF?.readDirectoryAsync) return [];
  try {
    const children: string[] = await SAF.readDirectoryAsync(dirUri);
    if (!Array.isArray(children)) return [];
    if (depth === 0) return children;
    const out: string[] = [];
    for (const c of children) {
      try {
        const sub = await SAF.readDirectoryAsync(c);
        if (Array.isArray(sub)) {
          for (const s of sub) out.push(s);
        } else {
          out.push(c);
        }
      } catch {
        out.push(c);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function listStatusFiles(opts: {
  wa: boolean;
  business: boolean;
}): Promise<StatusItem[]> {
  if (Platform.OS !== 'android') return [];
  const all: StatusItem[] = [];
  const seen = new Set<string>();
  const push = (f: StatusItem) => {
    const key = f.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    all.push(f);
  };

  // Media-library scan (primary, Play-safe path): query recent photos/videos
  // and keep files living under a WhatsApp .Statuses folder.
  if (await hasMediaAccess().catch(() => false)) {
    try {
      const res = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        first: 1000,
        sortBy: [['creationTime', false]],
      });
      for (const a of res.assets || []) {
        try {
          const uriLower = (a.uri || '').toLowerCase();
          if (!uriLower.includes('.statuses')) continue;
          const kind = a.mediaType === 'video' ? 'video' : 'image';
          if (kind === 'image' && !IMAGE_EXT.has(extOf(a.filename))) {
            // Trust MediaStore kind for odd extensions, keep if image-like
            if (!/jpe?g|png|webp|gif|bmp|heic/i.test(a.filename)) continue;
          }
          const decoded = (() => {
            try {
              return decodeURIComponent(a.uri);
            } catch {
              return a.uri;
            }
          })();
          const source: 'wa' | 'business' = /w4b|business/i.test(decoded) ? 'business' : 'wa';
          if ((source === 'wa' && !opts.wa) || (source === 'business' && !opts.business)) continue;
          push({
            id: a.id,
            uri: a.uri,
            name: a.filename,
            size: 0,
            mimeType: kind === 'image' ? 'image/*' : 'video/*',
            mtime: a.creationTime ?? null,
            source,
            isSAF: false,
          });
        } catch {
          continue;
        }
      }
      if (all.length > 0) {
        all.sort((a, b) => (b.mtime ?? -1) - (a.mtime ?? -1));
        return all;
      }
      // MediaStore returned nothing under .Statuses (hidden/.nomedia on some
      // devices) — fall through to direct/SAF scanning below.
    } catch {}
  }

  // Direct scan (needs all-files access).
  if (await hasAllFilesAccess().catch(() => false)) {
    const groups: Array<{ paths: string[]; source: 'wa' | 'business'; on: boolean }> = [
      { paths: WA_PATHS, source: 'wa', on: opts.wa },
      { paths: BUSINESS_PATHS, source: 'business', on: opts.business },
    ];
    for (const g of groups) {
      if (!g.on) continue;
      for (const p of g.paths) {
        try {
          const entries = await listDirectory(p);
          let found = false;
          for (const e of entries) {
            try {
              if (e.isDirectory) continue;
              if (isIgnored(e.name)) continue;
              const kind = classify(e.name);
              if (!kind) continue;
              found = true;
              push({
                id: e.path,
                uri: `file://${e.path}`,
                name: e.name,
                size: e.size || 0,
                mimeType: kind === 'image' ? 'image/*' : 'video/*',
                mtime: e.modified || null,
                source: g.source,
                isSAF: false,
              });
            } catch {
              continue;
            }
          }
          if (found) break;
        } catch {
          continue;
        }
      }
    }
  }

  // SAF grants, filtered by enabled sources.
  try {
    if (SAF?.getUriPermissionsAsync) {
      const perms = await SAF.getUriPermissionsAsync();
      if (Array.isArray(perms)) {
        for (const p of perms) {
          const dirUri = p?.directoryUri || p?.uri;
          if (typeof dirUri !== 'string') continue;
          const source = labelForSAFUri(dirUri);
          if ((source === 'wa' && !opts.wa) || (source === 'business' && !opts.business))
            continue;
          const docs = await listSAFDir(dirUri, 1);
          for (const doc of docs) {
            try {
              const name = safName(doc);
              if (isIgnored(name)) continue;
              const kind = classify(name);
              if (!kind) continue;
              push({
                id: doc,
                uri: doc,
                name,
                size: 0,
                mimeType: kind === 'image' ? 'image/*' : 'video/*',
                mtime: null,
                source,
                isSAF: true,
              });
            } catch {
              continue;
            }
          }
        }
      }
    }
  } catch {}

  all.sort((a, b) => (b.mtime ?? -1) - (a.mtime ?? -1));
  return all;
}

// ─── Single save ──────────────────────────────────────────────────────────────

export async function saveStatusToGallery(uri: string, name: string): Promise<void> {
  const perm = await MediaLibrary.requestPermissionsAsync();
  if (!perm.granted) throw new Error('Gallery permission denied');
  let localUri = uri;
  let staged = false;
  if (uri.startsWith('content://')) {
    const base = (FileSystem as any)?.cacheDirectory;
    if (!base) throw new Error('Cache unavailable');
    localUri = `${base}status_${Date.now()}_${name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await (FileSystem as any).copyAsync({ from: uri, to: localUri });
    staged = true;
  }
  try {
    const asset = await MediaLibrary.createAssetAsync(localUri);
    try {
      const album = await MediaLibrary.getAlbumAsync('Status Saver');
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync('Status Saver', asset, false);
    } catch {}
  } finally {
    if (staged) {
      try {
        await (FileSystem as any).deleteAsync(localUri, { idempotent: true });
      } catch {}
    }
  }
}
