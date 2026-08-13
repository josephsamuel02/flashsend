// src/networking/client.ts
// HTTP client for downloading files from peer devices
// Uses expo-file-system's resumable downloads for fault tolerance

import * as FileSystem from 'expo-file-system';
import { useTransferStore } from '../store/transferStore';
import type { FileManifestEntry, ServerManifestResponse } from './server';

const PROGRESS_INTERVAL_MS = 250;
const MAX_CONCURRENCY = 2;

export interface PeerConnection {
  ip: string;
  port: number;
  token: string;
}

export async function fetchManifest(peer: PeerConnection): Promise<ServerManifestResponse> {
  const url = `http://${peer.ip}:${peer.port}/manifest`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-session-token': peer.token,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<ServerManifestResponse>;
}

async function downloadFile(
  peer: PeerConnection,
  file: FileManifestEntry,
  destDir: string
): Promise<void> {
  const { updateFileProgress, setFileStatus, setFileLocalUri, setFileResumeData } = useTransferStore.getState();

  const url = `http://${peer.ip}:${peer.port}/file/${file.id}`;
  const destUri = `${destDir}${file.name}`;

  setFileStatus(file.id, 'active');

  let lastBytes = 0;
  let lastTime = Date.now();

  // Check for existing resumable data
  const existingResumeData = useTransferStore.getState().files.find(f => f.id === file.id)?.resumeData;

  const downloadResumable = existingResumeData
    ? FileSystem.createDownloadResumable(
        url,
        destUri,
        { headers: { 'x-session-token': peer.token } },
        (progress) => {
          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          const bytesDelta = progress.totalBytesWritten - lastBytes;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;

          updateFileProgress(file.id, progress.totalBytesWritten, speed);

          lastBytes = progress.totalBytesWritten;
          lastTime = now;
        },
        JSON.parse(existingResumeData)
      )
    : FileSystem.createDownloadResumable(
        url,
        destUri,
        { headers: { 'x-session-token': peer.token } },
        (progress) => {
          const now = Date.now();
          const elapsed = (now - lastTime) / 1000;
          const bytesDelta = progress.totalBytesWritten - lastBytes;
          const speed = elapsed > 0 ? bytesDelta / elapsed : 0;

          updateFileProgress(file.id, progress.totalBytesWritten, speed);

          lastBytes = progress.totalBytesWritten;
          lastTime = now;
        }
      );

  try {
    const result = await downloadResumable.downloadAsync();

    if (!result) {
      // Download was paused — save resume data
      const resumable = await downloadResumable.pauseAsync();
      setFileResumeData(file.id, JSON.stringify(resumable.savable()));
      return;
    }

    // Integrity check: verify file size matches manifest
    const fileInfo = await FileSystem.getInfoAsync(result.uri, { size: true });
    if (fileInfo.exists && fileInfo.size !== file.size) {
      setFileStatus(file.id, 'error', `Integrity check failed: expected ${file.size} bytes, got ${fileInfo.size}`);
      return;
    }

    setFileLocalUri(file.id, result.uri);
    setFileStatus(file.id, 'done');
  } catch (err: any) {
    // Save resume data on error for later retry
    try {
      const resumable = await downloadResumable.pauseAsync();
      setFileResumeData(file.id, JSON.stringify(resumable.savable()));
    } catch {}
    setFileStatus(file.id, 'error', err.message || 'Download failed');
  }
}

export async function downloadAllFiles(
  peer: PeerConnection,
  files: FileManifestEntry[],
  destDir: string
): Promise<void> {
  // Process with bounded concurrency (max 2-3 parallel)
  const queue = [...files];

  async function worker() {
    while (queue.length > 0) {
      const file = queue.shift()!;
      const status = useTransferStore.getState().files.find(f => f.id === file.id)?.status;
      if (status === 'cancelled') continue;
      await downloadFile(peer, file, destDir);
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, files.length) }, worker);
  await Promise.all(workers);
}
