// src/store/selectionStore.ts
// Zustand store for managing multi-tab file selection state

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
  clearSelection: () => void;
  getCount: () => number;
  getFiles: () => SelectedFile[];
  isSelected: (id: string) => boolean;
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
      return {
        selectedFiles: next,
        selectionMode: Object.keys(next).length > 0,
      };
    }),

  selectAll: (files) =>
    set((state) => {
      const next = { ...state.selectedFiles };
      files.forEach((f) => {
        next[f.id] = f;
      });
      return { selectedFiles: next, selectionMode: true };
    }),

  clearSelection: () => set({ selectedFiles: {}, selectionMode: false }),

  getCount: () => Object.keys(get().selectedFiles).length,

  getFiles: () => Object.values(get().selectedFiles),

  isSelected: (id) => !!get().selectedFiles[id],
}));
