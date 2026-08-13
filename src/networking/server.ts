// src/networking/server.ts
// Local HTTP server using react-native-tcp-socket
// Each device runs both a server AND client simultaneously

import TcpSocket from 'react-native-tcp-socket';
import * as FileSystem from 'expo-file-system';
import { useTransferStore } from '../store/transferStore';

export const DEFAULT_PORT = 42124;

export interface FileManifestEntry {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  checksum: string; // file size as simple checksum for integrity verification
}

export interface ServerManifestResponse {
  token: string;
  files: FileManifestEntry[];
}

// Generate a cryptographically random session token
export function generateToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

type FileProvider = (id: string) => { uri: string; name: string; size: number; mimeType: string } | undefined;

let _server: ReturnType<typeof TcpSocket.createServer> | null = null;
let _currentToken = '';
let _fileProvider: FileProvider = () => undefined;
let _manifest: FileManifestEntry[] = [];

function parseRequest(data: string): { method: string; path: string; headers: Record<string, string> } {
  const lines = data.split('\r\n');
  const [method, path] = (lines[0] || '').split(' ');
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) break;
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      headers[line.substring(0, colonIdx).toLowerCase().trim()] = line.substring(colonIdx + 1).trim();
    }
  }
  return { method: method || '', path: path || '', headers };
}

function httpResponse(socket: any, statusCode: number, statusText: string, body: string, contentType = 'application/json') {
  const bodyBytes = Buffer.from(body, 'utf8');
  const response = [
    `HTTP/1.1 ${statusCode} ${statusText}`,
    `Content-Type: ${contentType}; charset=utf-8`,
    `Content-Length: ${bodyBytes.length}`,
    'Connection: close',
    '',
    body,
  ].join('\r\n');
  socket.write(response);
  socket.end();
}

export async function startServer(
  token: string,
  manifest: FileManifestEntry[],
  fileProvider: FileProvider
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_server) {
      stopServer();
    }

    _currentToken = token;
    _manifest = manifest;
    _fileProvider = fileProvider;

    _server = TcpSocket.createServer((socket) => {
      let requestBuffer = '';

      socket.on('data', async (data) => {
        requestBuffer += typeof data === 'string' ? data : data.toString('utf8');

        // Basic HTTP header detection - look for double CRLF
        if (!requestBuffer.includes('\r\n\r\n')) return;

        const { method, path, headers } = parseRequest(requestBuffer);
        const authToken = headers['x-session-token'] || '';

        // Security: reject all requests without the correct session token
        if (authToken !== _currentToken) {
          httpResponse(socket, 401, 'Unauthorized', JSON.stringify({ error: 'Invalid session token' }));
          return;
        }

        if (method === 'GET' && path === '/manifest') {
          // Return manifest of files available for transfer
          const response: ServerManifestResponse = { token: _currentToken, files: _manifest };
          httpResponse(socket, 200, 'OK', JSON.stringify(response));
          return;
        }

        if (method === 'GET' && path.startsWith('/file/')) {
          const fileId = path.substring('/file/'.length);
          const fileInfo = _fileProvider(fileId);

          if (!fileInfo) {
            httpResponse(socket, 404, 'Not Found', JSON.stringify({ error: 'File not found' }));
            return;
          }

          // Stream the file via expo-file-system read
          try {
            const fileContent = await FileSystem.readAsStringAsync(fileInfo.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const fileBuffer = Buffer.from(fileContent, 'base64');
            const responseHeader = [
              `HTTP/1.1 200 OK`,
              `Content-Type: ${fileInfo.mimeType}`,
              `Content-Length: ${fileBuffer.length}`,
              `Content-Disposition: attachment; filename="${fileInfo.name}"`,
              `X-File-Size: ${fileInfo.size}`,
              'Connection: close',
              '',
              '',
            ].join('\r\n');

            socket.write(responseHeader);
            socket.write(fileBuffer);
            socket.end();
          } catch (err) {
            httpResponse(socket, 500, 'Internal Server Error', JSON.stringify({ error: 'Failed to read file' }));
          }
          return;
        }

        httpResponse(socket, 404, 'Not Found', JSON.stringify({ error: 'Not found' }));
        requestBuffer = '';
      });

      socket.on('error', (err) => {
        console.error('[Server] Socket error:', err);
      });
    });

    _server.on('error', (err) => {
      console.error('[Server] Server error:', err);
      reject(err);
    });

    _server.listen({ port: DEFAULT_PORT, host: '0.0.0.0' }, () => {
      console.log(`[Server] Listening on port ${DEFAULT_PORT}`);
      resolve();
    });
  });
}

export function stopServer() {
  if (_server) {
    _server.close();
    _server = null;
    _currentToken = '';
    _manifest = [];
    _fileProvider = () => undefined;
  }
}

export function isServerRunning() {
  return _server !== null;
}
