// src/store/settingsStore.ts
// App settings: auto-refresh + status sources, persisted.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_REFRESH_KEY = '@sendapp:autoRefresh';
const WA_STATUS_KEY = '@sendapp:waStatus';
const WA_BUSINESS_STATUS_KEY = '@sendapp:waBusinessStatus';
const DARK_MODE_KEY = '@sendapp:darkMode';

interface SettingsStore {
  autoRefresh: boolean;
  waStatus: boolean;
  waBusinessStatus: boolean;
  darkMode: boolean;
  loaded: boolean;
  setAutoRefresh: (v: boolean) => void;
  setWaStatus: (v: boolean) => void;
  setWaBusinessStatus: (v: boolean) => void;
  setDarkMode: (v: boolean) => void;
  load: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  autoRefresh: true,
  waStatus: true,
  waBusinessStatus: true,
  darkMode: false,
  loaded: false,

  setAutoRefresh: (v) => {
    set({ autoRefresh: v });
    AsyncStorage.setItem(AUTO_REFRESH_KEY, v ? 'true' : 'false').catch(() => {});
  },

  setWaStatus: (v) => {
    set({ waStatus: v });
    AsyncStorage.setItem(WA_STATUS_KEY, v ? 'true' : 'false').catch(() => {});
  },

  setWaBusinessStatus: (v) => {
    set({ waBusinessStatus: v });
    AsyncStorage.setItem(WA_BUSINESS_STATUS_KEY, v ? 'true' : 'false').catch(() => {});
  },

  setDarkMode: (v) => {
    set({ darkMode: v });
    AsyncStorage.setItem(DARK_MODE_KEY, v ? 'true' : 'false').catch(() => {});
  },

  load: async () => {
    try {
      const [ar, wa, wab, dm] = await Promise.all([
        AsyncStorage.getItem(AUTO_REFRESH_KEY),
        AsyncStorage.getItem(WA_STATUS_KEY),
        AsyncStorage.getItem(WA_BUSINESS_STATUS_KEY),
        AsyncStorage.getItem(DARK_MODE_KEY),
      ]);
      set({
        autoRefresh: ar === null ? true : ar === 'true',
        waStatus: wa === null ? true : wa === 'true',
        waBusinessStatus: wab === null ? true : wab === 'true',
        darkMode: dm === 'true',
        loaded: true,
      });
    } catch {
      set({ autoRefresh: true, waStatus: true, waBusinessStatus: true, darkMode: false, loaded: true });
    }
  },
}));
