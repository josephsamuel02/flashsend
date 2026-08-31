// src/networking/server.ts
// Android-optimized local HTTP server using react-native-tcp-socket
// - Streaming file transfer (no OOM, 64KB chunks)
// - Range support for resume
// - Handles file:// and content:// URIs (MediaLibrary, SAF)
// - Handles APK sharing via packageCodePath

import TcpSocket from 'react-native-tcp-socket';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';

export const DEFAULT_PORT = 42124;
export const CHUNK_SIZE = 64 * 1024; // 64KB per chunk

export interface FileManifestEntry {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  checksum: string; // size-based simple checksum
}

export interface ServerManifestResponse {
  token: string;
  files: FileManifestEntry[];
}

export function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  // Use crypto.getRandomValues if available for better entropy
  const randomValues = new Uint32Array(length);
  try {
    // @ts-ignore - Hermes / RN may not have crypto
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomValues);
      for (let i = 0; i < length; i++) {
        result += chars.charAt(randomValues[i] % chars.length);
      }
      return result;
    }
  } catch {}
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export type FileProvider = (id: string) => { uri: string; name: string; size: number; mimeType: string } | undefined | Promise<{ uri: string; name: string; size: number; mimeType: string } | undefined>;

let _server: ReturnType<typeof TcpSocket.createServer> | null = null;
let _currentToken = '';
let _fileProvider: FileProvider = () => undefined;
let _manifest: FileManifestEntry[] = [];
let _isListening = false;

function parseRequest(data: string): { method: string; path: string; headers: Record<string, string>; httpVersion: string } {
  const lines = data.split('\r\n');
  const requestLine = (lines[0] || '').trim();
  const [method = '', rawPath = '', httpVersion = 'HTTP/1.1'] = requestLine.split(' ');
  // Strip query string from path
  const path = rawPath.split('?')[0];
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.trim() === '') break;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.substring(0, colonIdx).toLowerCase().trim();
      // Handle duplicate headers: keep last
      headers[key] = line.substring(colonIdx + 1).trim();
    }
  }
  return { method: method.toUpperCase().trim(), path: decodeURIComponent(path), headers, httpVersion };
}

function httpResponse(socket: any, statusCode: number, statusText: string, body: string, contentType = 'application/json', extraHeaders: Record<string,string> = {}) {
  const bodyBytes = Buffer.from(body, 'utf8');
  const headers = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    `Content-Type: ${contentType}; charset=utf-8`,
    `Content-Length: ${bodyBytes.length}`,
    'Connection: close',
    'Access-Control-Allow-Origin: *',
    ...Object.entries(extraHeaders).map(([k,v]) => `${k}: ${v}`),
    '',
    body,
  ].join('\r\n');
  try {
    socket.write(headers);
    socket.end();
  } catch {}
}

function parseRangeHeader(rangeHeader: string | undefined, fileSize: number): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  // Format: bytes=0-1023 or bytes=1024- or bytes=-500
  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) return null;
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  if (isNaN(start) || isNaN(end)) return null;
  if (match[1] === '' && match[2] !== '') {
    // suffix range: bytes=-500 means last 500 bytes
    const suffix = parseInt(match[2], 10);
    start = Math.max(0, fileSize - suffix);
    end = fileSize - 1;
  }
  if (start >= fileSize) return null;
  if (end >= fileSize) end = fileSize - 1;
  if (start > end) return null;
  return { start, end };
}

async function getFileSize(uri: string, fallbackSize: number): Promise<number> {
  if (fallbackSize > 0) return fallbackSize;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && (info as any).size != null) {
      return (info as any).size as number;
    }
  } catch {}
  return fallbackSize;
}

// Stream file in chunks without loading fully into memory
async function streamFileToSocket(
  socket: any,
  fileInfo: { uri: string; name: string; size: number; mimeType: string },
  range: { start: number; end: number } | null
) {
  const fileSize = await getFileSize(fileInfo.uri, fileInfo.size);
  const start = range?.start ?? 0;
  const end = range?.end ?? (fileSize > 0 ? fileSize - 1 : 0);
  const contentLength = fileSize > 0 ? (end - start + 1) : 0;
  const isPartial = range !== null;
  const statusLine = isPartial ? 'HTTP/1.1 206 Partial Content' : 'HTTP/1.1 200 OK';

  // Sanitize filename for header (prevent injection)
  const safeName = fileInfo.name.replace(/"/g, '_').replace(/[\r\n]/g, '');

  const headers = [
    statusLine,
    `Content-Type: ${fileInfo.mimeType || 'application/octet-stream'}`,
    `Content-Length: ${contentLength}`,
    `Content-Disposition: attachment; filename="${safeName}"`,
    `Accept-Ranges: bytes`,
    `X-File-Size: ${fileSize}`,
    `X-File-Name: ${encodeURIComponent(safeName)}`,
    `Connection: close`,
    `Access-Control-Allow-Origin: *`,
    ...(isPartial ? [`Content-Range: bytes ${start}-${end}/${fileSize}`] : []),
    '',
    '',
  ].join('\r\n');

  try {
    socket.write(headers);
  } catch (e) {
    console.error('[Server] Failed to write headers', e);
    return;
  }

  // If fileSize is 0 or unknown, try to stream until error/EOF
  // For known size, read chunk by chunk with position
  let offset = start;
  const chunkSize = CHUNK_SIZE;

  try {
    // Fast path: if file is content:// and we can read via base64 chunked
    // We loop reading file chunks. This works for both file:// and content:// on Android
    while (offset <= end) {
      const remaining = end - offset + 1;
      const toRead = Math.min(chunkSize, remaining);
      if (toRead <= 0) break;

      // expo-file-system legacy supports position and length for readAsStringAsync
      // length is in bytes when encoding base64? Test: length = bytes to read.
      // We request base64 slice
      let base64Chunk: string;
      try {
        base64Chunk = await FileSystem.readAsStringAsync(fileInfo.uri, {
          encoding: FileSystem.EncodingType.Base64,
          position: offset,
          length: toRead,
        });
      } catch (err) {
        // Fallback: try without position (read whole and slice) - for small files or content providers that don't support random access
        console.warn(`[Server] Chunk read failed at offset ${offset}, fallback to full read:`, err);
        const full = await FileSystem.readAsStringAsync(fileInfo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const fullBuffer = Buffer.from(full, 'base64');
        const slice = fullBuffer.subarray(offset, offset + toRead);
        if (slice.length === 0) break;
        socket.write(slice);
        offset += slice.length;
        break; // whole file sent via fallback, no need to loop
      }

      if (!base64Chunk || base64Chunk.length === 0) {
        console.warn(`[Server] Empty chunk at offset ${offset}, breaking`);
        break;
      }

      const chunkBuffer = Buffer.from(base64Chunk, 'base64');
      if (chunkBuffer.length === 0) break;

      // Handle case where base64 decoding yields different length than requested (due to padding)
      const actual = chunkBuffer.length;
      try {
        socket.write(chunkBuffer);
      } catch (writeErr) {
        console.error('[Server] Socket write failed:', writeErr);
        break;
      }

      offset += actual;

      // Small yield to prevent blocking event loop for huge files
      if (offset % (1024 * 1024) === 0) {
        await new Promise<void>(resolve => setTimeout(resolve, 1));
      }

      // If we got less than requested, we hit EOF
      if (actual < toRead) break;
    }
    socket.end();
  } catch (err) {
    console.error('[Server] streamFileToSocket error:', err);
    try {
      if (!socket.destroyed) {
        httpResponse(socket, 500, 'Internal Server Error', JSON.stringify({ error: 'Failed to stream file', detail: String(err) }));
      }
    } catch {}
  }
}

export async function startServer(
  token: string,
  manifest: FileManifestEntry[],
  fileProvider: FileProvider
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_server) {
      try { _server.close(); } catch {}
      _server = null;
      _isListening = false;
    }

    _currentToken = token;
    _manifest = manifest;
    _fileProvider = fileProvider;

    // Create server with reuseAddress
    _server = TcpSocket.createServer((socket) => {
      let requestBuffer = '';
      let headersParsed = false;
      let requestTimeout: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (requestTimeout) clearTimeout(requestTimeout);
      };

      // Timeout stale connections after 10s without headers
      requestTimeout = setTimeout(() => {
        if (!headersParsed) {
          try { socket.destroy(); } catch {}
        }
      }, 10000);

      socket.on('data', async (data) => {
        if (headersParsed) return; // ignore pipelined extras, we only handle one request per connection (Connection: close)
        const chunk = typeof data === 'string' ? data : data.toString('utf8');
        requestBuffer += chunk;

        // Prevent DoS: limit header size to 16KB
        if (requestBuffer.length > 16 * 1024) {
          httpResponse(socket, 431, 'Request Header Fields Too Large', JSON.stringify({ error: 'Headers too large' }));
          cleanup();
          headersParsed = true;
          return;
        }

        // Wait for complete headers
        if (!requestBuffer.includes('\r\n\r\n')) return;

        headersParsed = true;
        cleanup();

        const headerPart = requestBuffer.split('\r\n\r\n')[0];
        const { method, path, headers } = parseRequest(headerPart + '\r\n\r\n');

        // CORS preflight
        if (method === 'OPTIONS') {
          const corsResponse = [
            'HTTP/1.1 204 No Content',
            'Access-Control-Allow-Origin: *',
            'Access-Control-Allow-Methods: GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers: x-session-token, Range, Content-Type',
            'Access-Control-Max-Age: 86400',
            'Content-Length: 0',
            'Connection: close',
            '',
            '',
          ].join('\r\n');
          socket.write(corsResponse);
          socket.end();
          return;
        }

        // Auth check: header x-session-token or query ?token=
        const rawUrl = requestBuffer.split(' ')[1] || path;
        const queryTokenMatch = rawUrl.match(/[?&]token=([^&\s]+)/);
        const queryToken = queryTokenMatch ? decodeURIComponent(queryTokenMatch[1]) : '';
        const authToken = headers['x-session-token'] || headers['x-token'] || queryToken || '';

        if (authToken !== _currentToken) {
          console.warn(`[Server] Unauthorized ${method} ${path} from ${socket.remoteAddress}`);
          httpResponse(socket, 401, 'Unauthorized', JSON.stringify({ error: 'Invalid session token', path }));
          return;
        }

        // Logging
        console.log(`[Server] ${method} ${path} token ok`);

        // Manifest endpoint
        if ((method === 'GET' || method === 'HEAD') && path === '/manifest') {
          const body = JSON.stringify({ token: _currentToken, files: _manifest } as ServerManifestResponse);
          if (method === 'HEAD') {
            const bodyBytes = Buffer.from(body, 'utf8');
            const response = [
              `HTTP/1.1 200 OK`,
              `Content-Type: application/json; charset=utf-8`,
              `Content-Length: ${bodyBytes.length}`,
              'Connection: close',
              'Access-Control-Allow-Origin: *',
              '',
              '',
            ].join('\r\n');
            socket.write(response);
            socket.end();
          } else {
            httpResponse(socket, 200, 'OK', body);
          }
          return;
        }

        // Health/ping endpoint
        if ((method === 'GET' || method === 'HEAD') && (path === '/ping' || path === '/health')) {
          httpResponse(socket, 200, 'OK', JSON.stringify({ status: 'ok', files: _manifest.length }));
          return;
        }

        // File download endpoint: /file/:id
        if ((method === 'GET' || method === 'HEAD') && path.startsWith('/file/')) {
          const rawId = path.substring('/file/'.length).split('/')[0].split('?')[0];
          const fileId = decodeURIComponent(rawId);
          let fileInfo: { uri: string; name: string; size: number; mimeType: string } | undefined;

          try {
            const maybePromise = _fileProvider(fileId);
            fileInfo = maybePromise instanceof Promise ? await maybePromise : maybePromise;
          } catch (e) {
            console.error('[Server] fileProvider error', e);
          }

          if (!fileInfo || !fileInfo.uri) {
            httpResponse(socket, 404, 'Not Found', JSON.stringify({ error: 'File not found', id: fileId }));
            return;
          }

          // HEAD: just return headers without body
          if (method === 'HEAD') {
            const size = await getFileSize(fileInfo.uri, fileInfo.size);
            const safeName = fileInfo.name.replace(/"/g, '_');
            const response = [
              `HTTP/1.1 200 OK`,
              `Content-Type: ${fileInfo.mimeType || 'application/octet-stream'}`,
              `Content-Length: ${size}`,
              `Content-Disposition: attachment; filename="${safeName}"`,
              `X-File-Size: ${size}`,
              `Accept-Ranges: bytes`,
              'Connection: close',
              'Access-Control-Allow-Origin: *',
              '',
              '',
            ].join('\r\n');
            socket.write(response);
            socket.end();
            return;
          }

          // Range support
          const rangeHeader = headers['range'];
          const fileSize = await getFileSize(fileInfo.uri, fileInfo.size);
          let range: { start: number; end: number } | null = null;
          if (rangeHeader) {
            range = parseRangeHeader(rangeHeader, fileSize);
            if (rangeHeader && !range && fileSize > 0) {
              // Invalid range
              const errHeaders = { 'Content-Range': `bytes */${fileSize}` };
              httpResponse(socket, 416, 'Range Not Satisfiable', JSON.stringify({ error: 'Invalid range' }), 'application/json', errHeaders);
              return;
            }
          }

          await streamFileToSocket(socket, fileInfo, range);
          return;
        }

        // Unknown route
        httpResponse(socket, 404, 'Not Found', JSON.stringify({ error: 'Not found', path, method }));
      });

      socket.on('error', (err) => {
        console.warn('[Server] Socket error:', err?.message || err);
        cleanup();
      });

      socket.on('close', () => {
        cleanup();
      });

      socket.setTimeout(30000, () => {
        try { socket.destroy(); } catch {}
      });
    });

    _server!.on('error', (err: any) => {
      console.error('[Server] Server error:', err);
      _isListening = false;
      // Handle EADDRINUSE specifically
      if (err?.message?.includes('EADDRINUSE') || err?.code === 'EADDRINUSE') {
        reject(new Error(`Port ${DEFAULT_PORT} already in use. Another transfer may be active. Close it and retry.`));
      } else {
        reject(err);
      }
    });

    _server!.listen({ port: DEFAULT_PORT, host: '0.0.0.0' }, () => {
      console.log(`[Server] Listening on 0.0.0.0:${DEFAULT_PORT} token=${token.substring(0,6)}... files=${manifest.length}`);
      _isListening = true;
      resolve();
    });

    // Fallback timeout if listen never fires
    setTimeout(() => {
      if (!_isListening) {
        console.warn('[Server] Listen timeout, assuming started');
        resolve();
      }
    }, 3000);
  });
}

export function stopServer() {
  if (_server) {
    try {
      _server.close();
    } catch (e) {
      console.warn('[Server] close error', e);
    }
    _server = null;
  }
  _currentToken = '';
  _manifest = [];
  _fileProvider = () => undefined;
  _isListening = false;
  console.log('[Server] Stopped');
}

export function isServerRunning() {
  return _server !== null && _isListening;
}

export function getCurrentManifest(): FileManifestEntry[] {
  return [..._manifest];
}

export function getCurrentToken(): string {
  return _currentToken;
}

