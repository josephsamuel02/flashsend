// src/networking/client.ts
// Android-optimized HTTP client for Xender-like transfers
// - Robust manifest fetch with timeout & retry
// - Streaming downloads with resume support
// - Saves to app private dir + MediaLibrary for gallery visibility
// - Handles duplicate filenames, progress throttling

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useTransferStore } from '../store/transferStore';
import type { FileManifestEntry, ServerManifestResponse } from './server';
import { getCandidateHostIPs } from './networkInfo';
import * as SendappNative from 'sendapp-native';
import { Buffer } from 'buffer';

const MAX_CONCURRENCY = 3;
const MANIFEST_TIMEOUT_MS = 12000;
const DOWNLOAD_TIMEOUT_MS = 120000; // 2 minutes for large files up to 10GB
const UPLOAD_TIMEOUT_MS = 120000; // 2 minutes for uploads

export interface PeerConnection {
  ip: string;
  port: number;
  token: string;
}

// Helper: timeout wrapper for fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal as any });
    clearTimeout(timeout);
    return resp;
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms (${url})`);
    }
    throw e;
  }
}

export async function fetchManifest(peer: PeerConnection, timeoutMs = MANIFEST_TIMEOUT_MS): Promise<ServerManifestResponse> {
  const url = `http://${peer.ip}:${peer.port}/manifest`;
  console.log(`[Client] Fetching manifest from ${url}`);

  // Retry twice on failure (common when hotspot DHCP not ready)
  let lastErr: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: 'GET',
        headers: {
          'x-session-token': peer.token,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      }, timeoutMs);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const errorMsg = `Server returned ${response.status} ${response.statusText}${text ? ': ' + text.slice(0, 100) : ''}`;
        console.warn(`[Client] Manifest attempt ${attempt} - ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const data = (await response.json()) as ServerManifestResponse;
      if (!data || !Array.isArray(data.files)) {
        throw new Error('Invalid manifest format: missing or invalid files array');
      }
      // Basic token validation
      if (data.token && data.token !== peer.token) {
        console.warn('[Client] Manifest token mismatch, but continuing');
      }
      console.log(`[Client] Manifest ok: ${data.files.length} files`);
      return data;
    } catch (err: any) {
      lastErr = err;
      const errMsg = err?.message || 'Unknown error';
      console.warn(`[Client] Manifest attempt ${attempt}/${2} failed:`, errMsg);
      
      if (attempt < 2) {
        // Wait before retry, with exponential backoff
        const delay = attempt === 1 ? 1000 : 1500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  // All attempts failed
  const finalError = lastErr?.message || 'Failed to fetch manifest';
  throw new Error(`Could not connect to sender after 2 attempts: ${finalError}. Ensure both devices are connected to the same network.`);
}

/**
 * Try the QR-advertised IP first (full retry), then known hotspot gateways
 * with a single fast attempt each. Returns the manifest plus the IP that
 * actually worked, so the caller can store the reachable peer address (QR IP
 * is often stale when the sender created a LocalOnlyHotspot after measuring
 * its old WiFi IP).
 *
 * Total worst-case ≈ 2×timeoutQR + N×timeoutFallback (≈10s + 4×3.5s = ~24s),
 * down from ~80s when every IP got 2×8s attempts. onAttempt lets the UI show
 * "Trying 192.168.43.1… (2/5)" instead of a stuck spinner.
 */
export async function fetchManifestWithFallbacks(
  peer: PeerConnection,
  timeoutMsPerIP = 5000,
  onAttempt?: (ip: string, index: number, total: number) => void
): Promise<{ manifest: ServerManifestResponse; workingIP: string }> {
  const candidates = getCandidateHostIPs(peer.ip);
  let lastErr: any = null;

  const fetchSingle = async (ip: string, timeoutMs: number): Promise<ServerManifestResponse> => {
    const url = `http://${ip}:${peer.port}/manifest`;
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'x-session-token': peer.token,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      },
      timeoutMs
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Server returned ${response.status}${text ? ': ' + text.slice(0, 100) : ''}`);
    }
    const data = (await response.json()) as ServerManifestResponse;
    if (!data || !Array.isArray(data.files)) {
      throw new Error('Invalid manifest format: missing files array');
    }
    return data;
  };

  for (let i = 0; i < candidates.length; i++) {
    const ip = candidates[i];
    try {
      onAttempt?.(ip, i + 1, candidates.length);
      let manifest: ServerManifestResponse;
      if (i === 0) {
        // QR-advertised IP gets the full 2-attempt retry (DHCP may still settle)
        manifest = await fetchManifest({ ...peer, ip }, timeoutMsPerIP);
      } else {
        // Fallbacks get one fast attempt each — keeps total time bounded
        manifest = await fetchSingle(ip, 3500);
      }
      if (ip !== peer.ip) {
        console.log(`[Client] Manifest succeeded via fallback IP ${ip} (QR had ${peer.ip})`);
      }
      return { manifest, workingIP: ip };
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Client] Manifest via ${ip} failed:`, err?.message || err);
    }
  }
  throw new Error(
    `Could not reach sender at ${peer.ip} (tried: ${candidates.join(', ')}). ` +
      `Last error: ${lastErr?.message || 'unknown'}. ` +
      `Make sure you joined the sender hotspot, WiFi is on, Location is ON, and mobile data is off.`
  );
}

// ── Categorization helpers — FlashSend/Images, Videos, Apps, Documents, Audio, Files ──
function getSubfolderForFile(mimeType: string, fileName: string): string {
  // Try native first for consistency
  try {
    const native = (SendappNative as any).getCategorizedSubfolder as ((m: string, n: string) => string) | undefined;
    if (native) {
      const sub = native(mimeType || '', fileName || '');
      if (sub) return sub;
    }
  } catch {}
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  const ext = name.split('.').pop() || '';
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','heic','heif','svg','tiff'].includes(ext)) return 'Images';
  if (mime.startsWith('video/') || ['mp4','mkv','avi','mov','wmv','flv','webm','m4v','3gp','ts'].includes(ext)) return 'Videos';
  if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac','aac','wma','opus'].includes(ext)) return 'Audio';
  if (mime === 'application/vnd.android.package-archive' || ext === 'apk' || ext === 'xapk' || ext === 'apks') return 'Apps';
  if (mime === 'application/pdf' || mime.includes('msword') || mime.includes('officedocument') || mime.includes('spreadsheet') || mime.includes('presentation') || mime.startsWith('text/') || ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','csv','rtf','odt','ods','odp','zip','rar','7z','tar','gz','json','xml','html','htm'].includes(ext)) return 'Documents';
  return 'Files';
}

async function ensureFlashSendBaseDirs(): Promise<void> {
  // Try native ensure first (creates external FlashSend + subfolders)
  try {
    const ensure = (SendappNative as any).ensureFlashSendDirs as (() => Promise<Record<string,string>>) | undefined;
    if (ensure) {
      await ensure();
      return;
    }
  } catch (e) {
    console.warn('[Client] ensureFlashSendDirs native failed', e);
  }
  // JS fallback: internal FlashSend subfolders
  const subs = ['Images','Videos','Apps','Documents','Audio','Files'];
  const base = (FileSystem.documentDirectory || '') + 'FlashSend/';
  for (const sub of subs) {
    const dir = `${base}${sub}/`;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    } catch {}
  }
}

async function getDestDirForFile(file: FileManifestEntry, fallbackBase: string): Promise<string> {
  const sub = getSubfolderForFile(file.mimeType, file.name);
  // Try native dest path first (external FlashSend/sub/)
  try {
    const nativeDest = (SendappNative as any).getDestPathForFile as ((m: string, n: string) => string | null) | undefined;
    if (nativeDest) {
      const nativePath = nativeDest(file.mimeType, file.name);
      if (nativePath) {
        const uri = nativePath.startsWith('file://') ? nativePath : `file://${nativePath.replace(/\/+$/, '')}/`;
        try {
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
        } catch {}
        return uri.endsWith('/') ? uri : `${uri}/`;
      }
    }
  } catch {}
  // Fallback to internal FlashSend categorized or provided fallbackBase categorized
  let base = fallbackBase;
  // If fallbackBase is generic like .../SendApp/received/ then we need to map to FlashSend categorized instead
  // Check if fallbackBase contains FlashSend, if not use internal FlashSend
  if (!base.includes('FlashSend')) {
    const internalBase = (FileSystem.documentDirectory || '') + 'FlashSend/';
    base = `${internalBase}${sub}/`;
    try {
      const info = await FileSystem.getInfoAsync(base);
      if (!info.exists) await FileSystem.makeDirectoryAsync(base, { intermediates: true });
    } catch {}
    return base;
  }
  // fallbackBase already is FlashSend-like but not categorized, append sub
  if (!base.endsWith('/')) base += '/';
  // If base already ends with Images/ etc, use as is
  if (base.includes('/Images/') || base.includes('/Videos/') || base.includes('/Apps/') || base.includes('/Documents/')) return base;
  const categorized = `${base}${sub}/`;
  try {
    const info = await FileSystem.getInfoAsync(categorized);
    if (!info.exists) await FileSystem.makeDirectoryAsync(categorized, { intermediates: true });
  } catch {}
  return categorized;
}

// Sanitize filename and handle collisions
function sanitizeFileName(name: string): string {
  // Remove illegal chars for Android filesystem
  let safe = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  if (!safe) safe = `file_${Date.now()}`;
  // Limit length to 200 chars to avoid path too long
  if (safe.length > 200) {
    const extIdx = safe.lastIndexOf('.');
    const ext = extIdx > 0 ? safe.substring(extIdx) : '';
    safe = safe.substring(0, 200 - ext.length) + ext;
  }
  return safe;
}

async function getUniqueDestUri(destDir: string, fileName: string): Promise<string> {
  const safeName = sanitizeFileName(fileName);
  let candidate = `${destDir}${safeName}`;
  let counter = 1;
  // Check existence and append (1), (2)...
  while (true) {
    try {
      const info = await FileSystem.getInfoAsync(candidate);
      if (!info.exists) break;
      const dotIdx = safeName.lastIndexOf('.');
      if (dotIdx > 0) {
        const base = safeName.substring(0, dotIdx);
        const ext = safeName.substring(dotIdx);
        candidate = `${destDir}${base} (${counter})${ext}`;
      } else {
        candidate = `${destDir}${safeName} (${counter})`;
      }
      counter++;
      if (counter > 100) break;
    } catch {
      break;
    }
  }
  return candidate;
}

async function saveToGalleryIfMedia(destUri: string, mimeType: string): Promise<string | null> {
  try {
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[Client] MediaLibrary permission not granted, skip gallery save');
        return null;
      }
      const asset = await MediaLibrary.createAssetAsync(destUri);
      // Try to move to album "Flash Send"
      try {
        const album = await MediaLibrary.getAlbumAsync('Flash Send');
        if (album) {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
          await MediaLibrary.createAlbumAsync('Flash Send', asset, false);
        }
      } catch (albumErr) {
        console.warn('[Client] Album save failed, but asset created:', albumErr);
      }
      return asset.uri;
    }
  } catch (e) {
    console.warn('[Client] Gallery save failed:', e);
  }
  return null;
}

async function downloadFile(
  peer: PeerConnection,
  file: FileManifestEntry,
  destDir: string
): Promise<void> {
  const { updateFileProgress, setFileStatus, setFileLocalUri, setFileResumeData } = useTransferStore.getState();

  // Check if cancelled before starting
  const currentStatus = useTransferStore.getState().files.find(f => f.id === file.id)?.status;
  if (currentStatus === 'cancelled') {
    console.log(`[Client] Skip cancelled file ${file.name}`);
    return;
  }

  const url = `http://${peer.ip}:${peer.port}/file/${encodeURIComponent(file.id)}?token=${encodeURIComponent(peer.token)}`;
  // Resolve categorized dest dir: FlashSend/Images, Videos, Apps, Documents etc
  const categorizedDir = await getDestDirForFile(file, destDir);
  const destUri = await getUniqueDestUri(categorizedDir, file.name);

  setFileStatus(file.id, 'active');
  updateFileProgress(file.id, 0, 0);

  let lastBytes = 0;
  let lastTime = Date.now();
  let lastProgressEmit = 0;

  const existingResumeData = useTransferStore.getState().files.find(f => f.id === file.id)?.resumeData;

  const onProgress = (progress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
    const now = Date.now();
    // Throttle to 250ms to avoid UI jank
    if (now - lastProgressEmit < 250 && progress.totalBytesWritten !== progress.totalBytesExpectedToWrite) return;
    lastProgressEmit = now;
    const elapsed = (now - lastTime) / 1000;
    const bytesDelta = progress.totalBytesWritten - lastBytes;
    const speed = elapsed > 0 ? bytesDelta / elapsed : 0;
    updateFileProgress(file.id, progress.totalBytesWritten, speed);
    lastBytes = progress.totalBytesWritten;
    lastTime = now;
  };

  const downloadResumable = existingResumeData
    ? FileSystem.createDownloadResumable(
        url,
        destUri,
        {
          headers: { 'x-session-token': peer.token },
          cache: false,
        } as any,
        onProgress,
        (() => {
          try { return JSON.parse(existingResumeData); } catch { return undefined; }
        })()
      )
    : FileSystem.createDownloadResumable(
        url,
        destUri,
        {
          headers: { 'x-session-token': peer.token },
          cache: false,
        } as any,
        onProgress
      );

  try {
    const result = await downloadResumable.downloadAsync();

    if (!result) {
      // Paused
      try {
        const resumable = await (downloadResumable as any).pauseAsync?.();
        if (resumable) setFileResumeData(file.id, JSON.stringify(resumable.savable()));
      } catch {}
      const statusAfter = useTransferStore.getState().files.find(f => f.id === file.id)?.status;
      if (statusAfter !== 'cancelled') {
        setFileStatus(file.id, 'error', 'Download paused');
      }
      return;
    }

    // Verify size if manifest has it
    let actualSize: number | null = null;
    try {
      const info: any = await FileSystem.getInfoAsync(result.uri);
      if (info.exists) actualSize = info.size ?? null;
    } catch {}

    if (file.size > 0 && actualSize != null && actualSize !== file.size) {
      console.warn(`[Client] Size mismatch for ${file.name}: expected ${file.size}, got ${actualSize}`);
      // Not fatal for some content:// where size was 0 initially; only error if expected >0 and mismatch >1%
      const diffPct = Math.abs(actualSize - file.size) / Math.max(file.size, 1);
      if (diffPct > 0.01) {
        setFileStatus(file.id, 'error', `Size mismatch: expected ${file.size}, got ${actualSize}`);
        return;
      }
    }

    // Try to save media to gallery (so user sees photos/videos in gallery)
    const galleryUri = await saveToGalleryIfMedia(result.uri, file.mimeType);
    const finalUri = galleryUri || result.uri;

    setFileLocalUri(file.id, finalUri);
    updateFileProgress(file.id, actualSize ?? file.size, 0);
    setFileStatus(file.id, 'done');
    console.log(`[Client] Done ${file.name} -> ${finalUri}`);
  } catch (err: any) {
    const msg = err?.message || String(err) || 'Download failed';
    console.error(`[Client] Download failed ${file.name}:`, msg);

    // Handle cancellation vs real error
    const isCancelled = useTransferStore.getState().files.find(f => f.id === file.id)?.status === 'cancelled';
    if (isCancelled) return;

    // Try save resume data for retry
    try {
      const resumable = await (downloadResumable as any).pauseAsync?.();
      if (resumable?.savable) {
        setFileResumeData(file.id, JSON.stringify(resumable.savable()));
      }
    } catch {}

    // If file partially downloaded, keep bytesTransferred
    setFileStatus(file.id, 'error', msg.slice(0, 300));
  }
}

export async function downloadAllFiles(
  peer: PeerConnection,
  files: FileManifestEntry[],
  destDir: string
): Promise<void> {
  if (!files || files.length === 0) {
    console.warn('[Client] No files to download');
    return;
  }

  // Ensure FlashSend categorized dirs exist (native external + fallback)
  await ensureFlashSendBaseDirs();
  // Also ensure provided destDir still exists as fallback
  try {
    const info = await FileSystem.getInfoAsync(destDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    }
  } catch (e) {
    console.error('[Client] Failed to create dest dir', e);
  }

  // Deduplicate and filter cancelled upfront
  const queue = [...files];
  let activeWorkers = 0;
  let index = 0;

  async function worker(workerId: number) {
    activeWorkers++;
    while (index < queue.length) {
      const fileIdx = index++;
      const file = queue[fileIdx];
      if (!file) break;
      const status = useTransferStore.getState().files.find(f => f.id === file.id)?.status;
      if (status === 'cancelled') {
        console.log(`[Client] Worker ${workerId} skipping cancelled ${file.name}`);
        continue;
      }
      console.log(`[Client] Worker ${workerId} downloading ${file.name}`);
      await downloadFile(peer, file, destDir);
      // Small delay between files to avoid overwhelming socket
      await new Promise(r => setTimeout(r, 150));
    }
    activeWorkers--;
  }

  const concurrency = Math.min(MAX_CONCURRENCY, files.length);
  console.log(`[Client] Starting ${concurrency} workers for ${files.length} files`);
  const workers = Array.from({ length: concurrency }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  console.log('[Client] All downloads finished');
}

// Retry a single failed file
export async function retryFile(peer: PeerConnection, file: FileManifestEntry, destDir: string): Promise<void> {
  const store = useTransferStore.getState();
  store.setFileStatus(file.id, 'pending', undefined);
  await downloadFile(peer, file, destDir);
}



// Upload file to peer (bidirectional transfer support)
export async function uploadFile(
  peer: PeerConnection,
  file: { id: string; name: string; uri: string; size: number; mimeType: string }
): Promise<void> {
  const url = `http://${peer.ip}:${peer.port}/upload`;
  console.log(`[Client] Uploading ${file.name} to ${url}`);

  const { setFileProgress, setFileStatus, setFileError } = useTransferStore.getState();

  try {
    setFileStatus(file.id, 'active');
    setFileProgress(file.id, 0, 0);

    // Read file as base64
    const base64Data = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to binary for upload
    const binaryData = Buffer.from(base64Data, 'base64');
    const actualSize = binaryData.length;

    console.log(`[Client] Uploading ${actualSize} bytes for ${file.name}`);

    // Use fetch with FormData or raw body
    // For React Native, we'll use FileSystem's uploadAsync if available, or construct raw request
    try {
      // Try using FileSystem.uploadAsync for better upload support
      const uploadResult = await (FileSystem as any).uploadAsync?.(url, file.uri, {
        httpMethod: 'POST',
        uploadType: (FileSystem as any).FileSystemUploadType?.BINARY_CONTENT,
        headers: {
          'x-session-token': peer.token,
          'x-file-name': encodeURIComponent(file.name),
          'x-file-size': String(actualSize),
          'x-mime-type': file.mimeType,
        },
      });

      if (uploadResult && uploadResult.status === 200) {
        console.log(`[Client] Upload success via uploadAsync:`, uploadResult);
        setFileProgress(file.id, actualSize, actualSize);
        setFileStatus(file.id, 'done');
        return;
      }
    } catch (uploadErr) {
      console.warn('[Client] uploadAsync failed, falling back to fetch:', uploadErr);
    }

    // Fallback: use fetch with base64 string as body
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'x-session-token': peer.token,
          'x-file-name': encodeURIComponent(file.name),
          'x-file-size': String(actualSize),
          'x-mime-type': file.mimeType,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(actualSize),
        },
        body: base64Data, // Send base64 string as body (server will decode if needed)
      },
      UPLOAD_TIMEOUT_MS
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Upload failed: ${response.status} ${errText}`);
    }

    const result = await response.json();
    console.log(`[Client] Upload success:`, result);

    setFileProgress(file.id, actualSize, actualSize);
    setFileStatus(file.id, 'done');
  } catch (err: any) {
    console.error(`[Client] uploadFile error for ${file.name}:`, err);
    const msg = err?.message || 'Upload failed';
    setFileError(file.id, msg);
    setFileStatus(file.id, 'error');
    throw err;
  }
}

// Upload multiple files with concurrency control
export async function uploadAllFiles(
  peer: PeerConnection,
  files: Array<{ id: string; name: string; uri: string; size: number; mimeType: string }>
): Promise<void> {
  console.log(`[Client] Starting upload of ${files.length} files to ${peer.ip}:${peer.port}`);

  const { setFileStatus, getFileById } = useTransferStore.getState();

  // Set all to pending
  files.forEach((f) => setFileStatus(f.id, 'pending'));

  const queue = [...files];
  const active = new Set<Promise<void>>();

  while (queue.length > 0 || active.size > 0) {
    // Fill active set up to MAX_CONCURRENCY
    while (queue.length > 0 && active.size < MAX_CONCURRENCY) {
      const file = queue.shift()!;
      const fileState = getFileById(file.id);
      if (fileState?.status === 'cancelled') continue;

      const uploadPromise = uploadFile(peer, file)
        .catch((err) => {
          console.warn(`[Client] Upload failed for ${file.name}:`, err);
        })
        .finally(() => {
          active.delete(uploadPromise);
        });

      active.add(uploadPromise);
    }

    if (active.size > 0) {
      await Promise.race(active);
    }
  }

  console.log('[Client] All uploads completed');
}
