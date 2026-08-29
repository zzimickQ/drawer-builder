import { create } from 'zustand'

import { DEFAULT_CONFIG, type DrawerConfig } from '@/lib/drawer'

export interface DrawerItem {
  id: string
  name: string
  config: DrawerConfig
}

interface DrawerState {
  /** All drawers built in the project */
  drawers: DrawerItem[]
  /** Id of the drawer being edited / shown in the viewport */
  selectedId: string
  /** Monotonic counter for auto-naming new drawers */
  nameCounter: number
  /** Carcass ghost opacity, 0–100 (0 hides it) */
  carcassOpacity: number

  selectDrawer: (id: string) => void
  addDrawer: () => void
  removeDrawer: (id: string) => void
  renameDrawer: (id: string, name: string) => void
  /** Patch the config of the selected drawer */
  setConfig: (patch: Partial<DrawerConfig>) => void
  /** Reset the selected drawer's config to defaults */
  resetConfig: () => void
  setCarcassOpacity: (opacity: number) => void
}

/** Selector: the config of the currently selected drawer. */
export const selectSelectedConfig = (state: DrawerState): DrawerConfig =>
  state.drawers.find((drawer) => drawer.id === state.selectedId)?.config ??
  DEFAULT_CONFIG

export const useDrawerStore = create<DrawerState>()((set) => ({
  drawers: [{ id: 'd1', name: 'Drawer 1', config: DEFAULT_CONFIG }],
  selectedId: 'd1',
  nameCounter: 2,
  carcassOpacity: 30,

  selectDrawer: (selectedId) => set({ selectedId }),

  addDrawer: () =>
    set((state) => {
      const id = crypto.randomUUID()
      return {
        drawers: [
          ...state.drawers,
          {
            id,
            name: `Drawer ${state.nameCounter}`,
            config: { ...DEFAULT_CONFIG },
          },
        ],
        selectedId: id,
        nameCounter: state.nameCounter + 1,
      }
    }),

  removeDrawer: (id) =>
    set((state) => {
      if (state.drawers.length <= 1) return state
      const drawers = state.drawers.filter((drawer) => drawer.id !== id)
      return {
        drawers,
        selectedId:
          state.selectedId === id ? drawers[0].id : state.selectedId,
      }
    }),

  renameDrawer: (id, name) =>
    set((state) => ({
      drawers: state.drawers.map((drawer) =>
        drawer.id === id ? { ...drawer, name } : drawer,
      ),
    })),

  setConfig: (patch) =>
    set((state) => ({
      drawers: state.drawers.map((drawer) =>
        drawer.id === state.selectedId
          ? { ...drawer, config: { ...drawer.config, ...patch } }
          : drawer,
      ),
    })),

  resetConfig: () =>
    set((state) => ({
      drawers: state.drawers.map((drawer) =>
        drawer.id === state.selectedId
          ? { ...drawer, config: DEFAULT_CONFIG }
          : drawer,
      ),
    })),

  setCarcassOpacity: (carcassOpacity) => set({ carcassOpacity }),
}))
