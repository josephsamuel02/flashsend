// src/utils/errorHandler.ts
// Centralized error handling and user-friendly error messages

export interface AppError {
  title: string;
  message: string;
  action?: string;
  actionLabel?: string;
}

export function handleNetworkError(error: any): AppError {
  const msg = error?.message || String(error) || 'Unknown error';
  
  if (msg.includes('Network request failed') || msg.includes('fetch failed')) {
    return {
      title: 'Connection Failed',
      message: 'Could not connect to the other device. Ensure both devices are on the same WiFi network or connected to the hotspot.',
      action: 'settings',
      actionLabel: 'WiFi Settings',
    };
  }
  
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return {
      title: 'Connection Timeout',
      message: 'The connection took too long. Move devices closer together and ensure WiFi signal is strong.',
    };
  }
  
  if (msg.includes('ECONNREFUSED') || msg.includes('Connection refused')) {
    return {
      title: 'Connection Refused',
      message: 'Could not reach the server. The sender may have closed the app or the hotspot may be off.',
    };
  }
  
  if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
    return {
      title: 'Access Denied',
      message: 'Invalid session token. The transfer session may have expired. Start a new transfer.',
    };
  }
  
  if (msg.includes('EADDRINUSE') || msg.includes('Port') || msg.includes('42124')) {
    return {
      title: 'Port Already In Use',
      message: 'Another file transfer is already active. Close other file sharing apps and try again.',
    };
  }
  
  return {
    title: 'Network Error',
    message: msg.slice(0, 200),
  };
}

export function handleHotspotError(error: any): AppError {
  const msg = error?.message || String(error) || 'Unknown error';
  
  if (msg.includes('PERMISSION_DENIED') || msg.includes('permission')) {
    return {
      title: 'Permission Required',
      message: 'Location or Nearby Devices permission is required to create a hotspot. Please grant the permission in Settings.',
      action: 'settings',
      actionLabel: 'Open Settings',
    };
  }
  
  if (msg.includes('Tethering disallowed') || msg.includes('TETHERING_DISALLOWED')) {
    return {
      title: 'Hotspot Blocked',
      message: 'Your carrier or device policy blocks hotspot creation. Try: 1) Turn off any active hotspot, 2) Restart device, 3) Use same WiFi instead.',
    };
  }
  
  if (msg.includes('Incompatible') || msg.includes('INCOMPATIBLE_MODE')) {
    return {
      title: 'Incompatible WiFi Mode',
      message: 'WiFi is in an incompatible state. Turn off WiFi Direct, existing hotspot, or VPN, then try again.',
    };
  }
  
  return {
    title: 'Hotspot Failed',
    message: msg.slice(0, 200),
  };
}

export function handleFileError(error: any, fileName: string): AppError {
  const msg = error?.message || String(error) || 'Unknown error';
  
  if (msg.includes('ENOSPC') || msg.includes('No space') || msg.includes('storage')) {
    return {
      title: 'Storage Full',
      message: `Insufficient storage space to save "${fileName}". Free up space and retry.`,
      action: 'settings',
      actionLabel: 'Storage Settings',
    };
  }
  
  if (msg.includes('EACCES') || msg.includes('Permission denied')) {
    return {
      title: 'Permission Denied',
      message: `Cannot write to storage. Grant storage permissions to Flash Send in Settings.`,
      action: 'settings',
      actionLabel: 'App Permissions',
    };
  }
  
  if (msg.includes('404') || msg.includes('Not Found')) {
    return {
      title: 'File Not Found',
      message: `"${fileName}" is no longer available on the sender.`,
    };
  }
  
  if (msg.includes('Size mismatch')) {
    return {
      title: 'Size Mismatch',
      message: `Downloaded file size doesn't match expected size for "${fileName}". The file may be corrupted. Try again.`,
    };
  }
  
  return {
    title: 'File Error',
    message: `Failed to process "${fileName}": ${msg.slice(0, 150)}`,
  };
}

export function handlePermissionError(permission: string): AppError {
  const permMap: Record<string, string> = {
    camera: 'Camera access is needed to scan QR codes.',
    location: 'Location access is required for WiFi features on Android 12 and below.',
    'nearby-devices': 'Nearby Devices permission is required for WiFi features on Android 13+.',
    storage: 'Storage access is needed to save received files.',
    'media-library': 'Media Library access is needed to save photos and videos to gallery.',
  };
  
  return {
    title: 'Permission Required',
    message: permMap[permission] || `${permission} permission is required.`,
    action: 'settings',
    actionLabel: 'Open Settings',
  };
}

// Format file sizes consistently
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Format transfer speed
export function formatSpeed(bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 B/s';
  if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
}

// Estimate time remaining
export function formatTimeRemaining(bytesRemaining: number, bytesPerSecond: number): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return 'calculating...';
  const seconds = Math.ceil(bytesRemaining / bytesPerSecond);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}
