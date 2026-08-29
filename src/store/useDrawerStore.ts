import { create } from 'zustand'

import { DEFAULT_CONFIG, type DrawerConfig } from '@/lib/drawer'

interface DrawerState {
  /** All drawer build parameters */
  config: DrawerConfig
  /** Carcass ghost opacity, 0–100 (0 hides it) */
  carcassOpacity: number

  setConfig: (patch: Partial<DrawerConfig>) => void
  resetConfig: () => void
  setCarcassOpacity: (opacity: number) => void
}

export const useDrawerStore = create<DrawerState>()((set) => ({
  config: DEFAULT_CONFIG,
  carcassOpacity: 30,

  setConfig: (patch) =>
    set((state) => ({ config: { ...state.config, ...patch } })),

  resetConfig: () => set({ config: DEFAULT_CONFIG }),

  setCarcassOpacity: (opacity) => set({ carcassOpacity: opacity }),
}))
