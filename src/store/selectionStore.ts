// src/store/selectionStore.ts
// Zustand store for managing multi-tab file selection (Xender-like)

import { create } from 'zustand';

export type TabName = 'Apps' | 'Photos' | 'Videos' | 'Audio' | 'Files';

export interface SelectedFile {
  id: string;
  name: string;
  uri: string;
  size: number;
  mimeType: string;
  tab: TabName;
  thumbnail?: string;
}

interface SelectionStore {
  selectedFiles: Record<string, SelectedFile>; // keyed by id
  selectionMode: boolean;

  toggleFile: (file: SelectedFile) => void;
  selectAll: (files: SelectedFile[]) => void;
  deselectAll: (files: SelectedFile[]) => void;
  clearSelection: () => void;
  clearTab: (tab: TabName) => void;
  getCount: () => number;
  getCountByTab: (tab: TabName) => number;
  getFiles: () => SelectedFile[];
  getFilesByTab: (tab: TabName) => SelectedFile[];
  getTotalSize: () => number;
  isSelected: (id: string) => boolean;
  hasSelection: () => boolean;
}

export const useSelectionStore = create<SelectionStore>((set, get) => ({
  selectedFiles: {},
  selectionMode: false,

  toggleFile: (file) =>
    set((state) => {
      const next = { ...state.selectedFiles };
      if (next[file.id]) {
        delete next[file.id];
      } else {
        next[file.id] = file;
      }
      const hasAny = Object.keys(next).length > 0;
      return {
        selectedFiles: next,
        selectionMode: hasAny,
      };
    }),

  selectAll: (files) =>
    set((state) => {
      const next = { ...state.selectedFiles };
      let added = 0;
      files.forEach((f) => {
        if (!next[f.id]) {
          next[f.id] = f;
          added++;
        }
      });
      // If already all selected, do nothing special; keep selectionMode true if any exists
      return { selectedFiles: next, selectionMode: Object.keys(next).length > 0 };
    }),

  deselectAll: (files) =>
    set((state) => {
      const next = { ...state.selectedFiles };
      files.forEach((f) => delete next[f.id]);
      return {
        selectedFiles: next,
        selectionMode: Object.keys(next).length > 0,
      };
    }),

  clearSelection: () => set({ selectedFiles: {}, selectionMode: false }),

  clearTab: (tab) =>
    set((state) => {
      const next: Record<string, SelectedFile> = {};
      Object.entries(state.selectedFiles).forEach(([id, f]) => {
        if (f.tab !== tab) next[id] = f;
      });
      return {
        selectedFiles: next,
        selectionMode: Object.keys(next).length > 0,
      };
    }),

  getCount: () => Object.keys(get().selectedFiles).length,

  getCountByTab: (tab) => Object.values(get().selectedFiles).filter(f => f.tab === tab).length,

  getFiles: () => Object.values(get().selectedFiles),

  getFilesByTab: (tab) => Object.values(get().selectedFiles).filter(f => f.tab === tab),

  getTotalSize: () => Object.values(get().selectedFiles).reduce((sum, f) => sum + (f.size || 0), 0),

  isSelected: (id) => !!get().selectedFiles[id],

  hasSelection: () => Object.keys(get().selectedFiles).length > 0,
}));
