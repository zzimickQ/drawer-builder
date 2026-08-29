import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { optimize, type OptimizationResult } from '@/lib/cutlist/optimizer'
import {
  defaultStocks,
  ensureStockForMaterials,
  partsFromDrawers,
} from '@/lib/cutlist/stock'
import {
  DEFAULT_OPTIONS,
  type OptimizationOptions,
  type PartSpec,
  type StockSpec,
} from '@/lib/cutlist/types'
import { useDrawerStore } from '@/store/useDrawerStore'

type ListUpdater<T> = T[] | ((prev: T[]) => T[])

function applyUpdater<T>(updater: ListUpdater<T>, prev: T[]): T[] {
  return typeof updater === 'function' ? (updater as (p: T[]) => T[])(prev) : updater
}

interface CutlistState {
  /** Editable parts to cut. */
  parts: PartSpec[]
  /** Available stock sheet formats. */
  stocks: StockSpec[]
  options: OptimizationOptions
  /** Hide the label column in the parts/stock tables. */
  showLabels: boolean
  /** Hide the material column in the parts/stock tables. */
  showMaterials: boolean
  /** Last optimization plan (never persisted — recomputed on demand). */
  result: OptimizationResult | null
  /** Whether a plan has been produced; restores the plan on reload. */
  calculated: boolean
  /** Whether parts were bootstrapped from drawers at least once. */
  initialized: boolean

  setParts: (updater: ListUpdater<PartSpec>) => void
  setStocks: (updater: ListUpdater<StockSpec>) => void
  patchOptions: (patch: Partial<OptimizationOptions>) => void
  setShowLabels: (show: boolean) => void
  setShowMaterials: (show: boolean) => void
  setResult: (result: OptimizationResult | null) => void
  /** First-time only: import every drawer's boards as parts. */
  bootstrap: () => void
  /** Run the optimizer over the current inputs. */
  calculate: () => void
}

export const useCutlistStore = create<CutlistState>()(
  persist(
    (set, get) => ({
      parts: [],
      stocks: defaultStocks(),
      options: { ...DEFAULT_OPTIONS },
      showLabels: true,
      showMaterials: true,
      result: null,
      calculated: false,
      initialized: false,

      setParts: (updater) => set((s) => ({ parts: applyUpdater(updater, s.parts) })),
      setStocks: (updater) =>
        set((s) => ({ stocks: applyUpdater(updater, s.stocks) })),
      patchOptions: (patch) =>
        set((s) => ({ options: { ...s.options, ...patch } })),
      setShowLabels: (show) => set({ showLabels: show }),
      setShowMaterials: (show) => set({ showMaterials: show }),
      setResult: (result) => set({ result, calculated: result !== null }),

      bootstrap: () => {
        if (get().initialized) return
        const drawers = useDrawerStore.getState().drawers
        const imported = drawers.length > 0 ? partsFromDrawers(drawers) : []
        set((s) => ({
          parts: imported.length > 0 ? imported : s.parts,
          stocks: ensureStockForMaterials(s.stocks, imported),
          initialized: true,
        }))
      },

      calculate: () => {
        const { parts, stocks, options } = get()
        if (parts.length === 0 || stocks.length === 0) return
        set({ result: optimize(parts, stocks, options), calculated: true })
      },
    }),
    {
      name: 'drawer-builder-cutlist',
      partialize: (state) => ({
        parts: state.parts,
        stocks: state.stocks,
        options: state.options,
        showLabels: state.showLabels,
        showMaterials: state.showMaterials,
        calculated: state.calculated,
        initialized: state.initialized,
      }),
    },
  ),
)
