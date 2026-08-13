// src/store/transferStore.ts
// Zustand store for managing transfer sessions and progress state

import { create } from 'zustand';

export type FileDirection = 'outgoing' | 'incoming';
export type FileStatus = 'pending' | 'active' | 'done' | 'error' | 'cancelled';

export interface TransferFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  direction: FileDirection;
  status: FileStatus;
  bytesTransferred: number;
  speed: number; // bytes/sec
  checksum?: string;
  localUri?: string;
  error?: string;
  resumeData?: string; // expo-file-system resumable download data
}

export interface SessionInfo {
  token: string;
  localIP: string;
  port: number;
  peerIP?: string;
  peerPort?: number;
}

export type SessionState = 'idle' | 'hosting' | 'connected' | 'done';

interface TransferStore {
  sessionState: SessionState;
  session: SessionInfo | null;
  files: TransferFile[];
  totalBytes: number;
  bytesTransferred: number;

  setSession: (session: SessionInfo | null) => void;
  setSessionState: (state: SessionState) => void;
  addFiles: (files: Omit<TransferFile, 'bytesTransferred' | 'speed' | 'status'>[]) => void;
  updateFileProgress: (id: string, bytesTransferred: number, speed: number) => void;
  setFileStatus: (id: string, status: FileStatus, error?: string) => void;
  setFileLocalUri: (id: string, localUri: string) => void;
  setFileResumeData: (id: string, resumeData: string) => void;
  cancelFile: (id: string) => void;
  clearSession: () => void;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  sessionState: 'idle',
  session: null,
  files: [],
  totalBytes: 0,
  bytesTransferred: 0,

  setSession: (session) => set({ session }),
  setSessionState: (sessionState) => set({ sessionState }),

  addFiles: (newFiles) =>
    set((state) => {
      const files: TransferFile[] = [
        ...state.files,
        ...newFiles.map((f) => ({
          ...f,
          bytesTransferred: 0,
          speed: 0,
          status: 'pending' as FileStatus,
        })),
      ];
      return {
        files,
        totalBytes: files.reduce((sum, f) => sum + f.size, 0),
      };
    }),

  updateFileProgress: (id, bytesTransferred, speed) =>
    set((state) => {
      const files = state.files.map((f) =>
        f.id === id ? { ...f, bytesTransferred, speed, status: 'active' as FileStatus } : f
      );
      const totalTransferred = files.reduce((sum, f) => sum + f.bytesTransferred, 0);
      return { files, bytesTransferred: totalTransferred };
    }),

  setFileStatus: (id, status, error) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status, error, ...(status === 'done' ? { bytesTransferred: f.size, speed: 0 } : {}) } : f
      ),
    })),

  setFileLocalUri: (id, localUri) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, localUri } : f)),
    })),

  setFileResumeData: (id, resumeData) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, resumeData } : f)),
    })),

  cancelFile: (id) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, status: 'cancelled' } : f)),
    })),

  clearSession: () =>
    set({
      sessionState: 'idle',
      session: null,
      files: [],
      totalBytes: 0,
      bytesTransferred: 0,
    }),
}));
