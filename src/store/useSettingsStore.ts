import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_DEFAULTS, type DrawerDefaults } from '@/lib/drawer'
import type { DisplayUnit } from '@/lib/units'

export interface ViewportState {
  /** Camera position [x, y, z] in world units */
  cameraPosition: [number, number, number]
  /** Orbit controls target [x, y, z] in world units */
  target: [number, number, number]
}

interface SettingsState {
  /** Unit used to display all dimensions in the UI */
  displayUnit: DisplayUnit
  /** Last camera orientation, persisted across refresh */
  viewport: ViewportState | null
  /** Incremented to request a viewport reset (not persisted) */
  viewportResetCount: number
  /** Construction defaults applied to newly created drawers */
  drawerDefaults: DrawerDefaults
  /** Whether the first-run defaults dialog has been completed */
  defaultsConfigured: boolean

  setDisplayUnit: (unit: DisplayUnit) => void
  setViewport: (viewport: ViewportState | null) => void
  requestViewportReset: () => void
  saveDefaults: (defaults: DrawerDefaults) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      displayUnit: 'mm',
      viewport: null,
      viewportResetCount: 0,
      drawerDefaults: DEFAULT_DEFAULTS,
      defaultsConfigured: false,

      setDisplayUnit: (displayUnit) => set({ displayUnit }),
      setViewport: (viewport) => set({ viewport }),
      requestViewportReset: () =>
        set((state) => ({ viewportResetCount: state.viewportResetCount + 1 })),
      saveDefaults: (drawerDefaults) =>
        set({ drawerDefaults, defaultsConfigured: true }),
    }),
    {
      name: 'drawer-builder-settings',
      // Only these fields are written to localStorage
      partialize: (state) => ({
        displayUnit: state.displayUnit,
        viewport: state.viewport,
        drawerDefaults: state.drawerDefaults,
        defaultsConfigured: state.defaultsConfigured,
      }),
    },
  ),
)
