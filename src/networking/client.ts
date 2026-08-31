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

const MAX_CONCURRENCY = 2;
const MANIFEST_TIMEOUT_MS = 8000;
const DOWNLOAD_TIMEOUT_MS = 30000;

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

  // Retry once on failure (common when hotspot DHCP not ready)
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
        throw new Error(`Manifest fetch failed: ${response.status} ${response.statusText} ${text}`);
      }

      const data = (await response.json()) as ServerManifestResponse;
      if (!data || !Array.isArray(data.files)) {
        throw new Error('Invalid manifest format');
      }
      // Basic token validation
      if (data.token && data.token !== peer.token) {
        console.warn('[Client] Manifest token mismatch, but continuing');
      }
      console.log(`[Client] Manifest ok: ${data.files.length} files`);
      return data;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[Client] Manifest attempt ${attempt} failed:`, err?.message);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 800));
      }
    }
  }
  throw lastErr || new Error('Failed to fetch manifest');
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
  const destUri = await getUniqueDestUri(destDir, file.name);

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

  // Ensure dest dir exists
  try {
    const info = await FileSystem.getInfoAsync(destDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
    }
  } catch (e) {
    console.error('[Client] Failed to create dest dir', e);
    // Try fallback to cacheDirectory
    // but destDir is already documentDirectory based; if fails, throw
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

