// src/store/transferStore.ts
// Zustand store for managing transfer sessions and progress (Xender-like)

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
  resumeData?: string;
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
  history: { id: string; date: number; files: TransferFile[]; session: SessionInfo | null }[];

  setSession: (session: SessionInfo | null) => void;
  setSessionState: (state: SessionState) => void;
  addFiles: (files: Omit<TransferFile, 'bytesTransferred' | 'speed' | 'status'>[]) => void;
  replaceFiles: (files: Omit<TransferFile, 'bytesTransferred' | 'speed' | 'status'>[]) => void;
  updateFileProgress: (id: string, bytesTransferred: number, speed: number) => void;
  setFileStatus: (id: string, status: FileStatus, error?: string) => void;
  setFileProgress: (id: string, bytesTransferred: number, speed: number) => void;
  setFileError: (id: string, error: string) => void;
  getFileById: (id: string) => TransferFile | undefined;
  setFileLocalUri: (id: string, localUri: string) => void;
  setFileResumeData: (id: string, resumeData: string) => void;
  cancelFile: (id: string) => void;
  retryFile: (id: string) => void;
  clearSession: () => void;
  archiveSession: () => void;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  sessionState: 'idle',
  session: null,
  files: [],
  totalBytes: 0,
  bytesTransferred: 0,
  history: [],

  setSession: (session) => set({ session }),
  setSessionState: (sessionState) => set({ sessionState }),

  addFiles: (newFiles) =>
    set((state) => {
      // Avoid duplicates by id
      const existingIds = new Set(state.files.map(f => f.id));
      const filtered = newFiles.filter(f => !existingIds.has(f.id));
      if (filtered.length === 0) return state;
      const files: TransferFile[] = [
        ...state.files,
        ...filtered.map((f) => ({
          ...f,
          bytesTransferred: 0,
          speed: 0,
          status: 'pending' as FileStatus,
        })),
      ];
      return {
        files,
        totalBytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
        bytesTransferred: files.reduce((sum, f) => sum + (f.bytesTransferred || 0), 0),
      };
    }),

  replaceFiles: (newFiles) =>
    set(() => {
      const files: TransferFile[] = newFiles.map((f) => ({
        ...f,
        bytesTransferred: 0,
        speed: 0,
        status: 'pending' as FileStatus,
      }));
      return {
        files,
        totalBytes: files.reduce((sum, f) => sum + (f.size || 0), 0),
        bytesTransferred: 0,
      };
    }),

  updateFileProgress: (id, bytesTransferred, speed) =>
    set((state) => {
      const target = state.files.find(f => f.id === id);
      if (!target) return state;
      // Don't update if already done/cancelled
      if (target.status === 'done' || target.status === 'cancelled') return state;
      const files = state.files.map((f) =>
        f.id === id ? { ...f, bytesTransferred: Math.min(bytesTransferred, f.size || bytesTransferred), speed, status: 'active' as FileStatus } : f
      );
      const totalTransferred = files.reduce((sum, f) => sum + (f.bytesTransferred || 0), 0);
      return { files, bytesTransferred: totalTransferred };
    }),

  setFileProgress: (id, bytesTransferred, speed) =>
    set((state) => {
      const files = state.files.map((f) =>
        f.id === id ? { ...f, bytesTransferred, speed } : f
      );
      return { files, bytesTransferred: files.reduce((sum, f) => sum + (f.bytesTransferred || 0), 0) };
    }),

  setFileError: (id, error) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, error } : f)),
    })),

  getFileById: (id) => get().files.find(f => f.id === id),

  setFileStatus: (id, status, error) =>
    set((state) => {
      const files = state.files.map((f) =>
        f.id === id
          ? {
              ...f,
              status,
              error,
              ...(status === 'done' ? { bytesTransferred: f.size || f.bytesTransferred, speed: 0 } : {}),
              ...(status === 'error' ? { speed: 0 } : {}),
              ...(status === 'cancelled' ? { speed: 0 } : {}),
            }
          : f
      );
      const stillActive = files.some(f => f.status === 'pending' || f.status === 'active');
      const allDone = files.length > 0 && files.every(f => f.status === 'done' || f.status === 'cancelled' || f.status === 'error');
      return {
        files,
        // If all done, mark session as done
        sessionState: allDone && state.sessionState !== 'idle' ? 'done' : state.sessionState,
        bytesTransferred: files.reduce((sum, f) => sum + (f.bytesTransferred || 0), 0),
      };
    }),

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
      files: state.files.map((f) => (f.id === id && f.status !== 'done' ? { ...f, status: 'cancelled' as FileStatus, speed: 0, error: undefined } : f)),
    })),

  retryFile: (id) =>
    set((state) => ({
      files: state.files.map((f) =>
        f.id === id ? { ...f, status: 'pending' as FileStatus, error: undefined, bytesTransferred: 0, speed: 0 } : f
      ),
    })),

  clearSession: () =>
    set({
      sessionState: 'idle',
      session: null,
      files: [],
      totalBytes: 0,
      bytesTransferred: 0,
    }),

  archiveSession: () =>
    set((state) => {
      if (state.files.length === 0) return state;
      const entry = {
        id: `${Date.now()}`,
        date: Date.now(),
        files: [...state.files],
        session: state.session,
      };
      return {
        history: [entry, ...state.history].slice(0, 20),
        sessionState: 'idle',
        session: null,
        files: [],
        totalBytes: 0,
        bytesTransferred: 0,
      };
    }),
}));
