import { buildCutlist } from '@/lib/drawer'
import type { PartSpec, StockSpec } from '@/lib/cutlist/types'
import type { DrawerItem } from '@/store/useDrawerStore'

/** Common sheet formats (mm) offered as one-click presets. */
export const STOCK_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '2440×1220', width: 2440, height: 1220 },
  { label: '2440×610', width: 2440, height: 610 },
  { label: '1830×915', width: 1830, height: 915 },
  { label: '1830×610', width: 1830, height: 610 },
  { label: '2000×1000', width: 2000, height: 1000 },
  { label: '1220×610', width: 1220, height: 610 },
  { label: '2800×2070', width: 2800, height: 2070 },
  { label: '3050×1220', width: 3050, height: 1220 },
]

export const DEFAULT_STOCK_QTY = 5

/** A sensible starting stock list (4×8 ft sheets). */
export function defaultStocks(material?: string): StockSpec[] {
  return [
    {
      id: crypto.randomUUID(),
      label: '2440×1220',
      width: 2440,
      height: 1220,
      qty: DEFAULT_STOCK_QTY,
      material,
    },
  ]
}

/**
 * Converts the selected drawers' cutlists into editable parts. Each board row
 * becomes a part whose material is its thickness — turning on "consider
 * material" then separates box panels from bottoms cleanly.
 */
export function partsFromDrawers(drawers: DrawerItem[]): PartSpec[] {
  const out: PartSpec[] = []
  for (const drawer of drawers) {
    const cutlist = buildCutlist(drawer.config)
    for (const group of cutlist.groups) {
      for (const row of group.rows) {
        out.push({
          id: crypto.randomUUID(),
          label: `${row.part} · ${drawer.name}`,
          width: row.length,
          height: row.width,
          qty: row.qty,
          material: `${row.thickness} mm`,
          canRotate: true,
        })
      }
    }
  }
  return out
}

/**
 * Ensures every distinct part material has at least one compatible default
 * stock sheet, so "consider material" works without manual stock setup.
 */
export function ensureStockForMaterials(
  stocks: StockSpec[],
  parts: PartSpec[],
): StockSpec[] {
  const materials = new Set(parts.map((p) => p.material).filter(Boolean))
  const existing = new Set(stocks.map((s) => s.material))
  const next = stocks.slice()
  for (const material of materials) {
    if (!existing.has(material)) {
      next.push({
        id: crypto.randomUUID(),
        label: '2440×1220',
        width: 2440,
        height: 1220,
        qty: DEFAULT_STOCK_QTY,
        material,
      })
    }
  }
  return next
}
