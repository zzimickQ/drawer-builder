import { hashString, mulberry32, seededShuffle } from '@/lib/cutlist/prng'
import type {
  OptimizationOptions,
  OptimizationPriority,
  PartSpec,
  StockSpec,
} from '@/lib/cutlist/types'

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const rectArea = (r: Rect): number => r.w * r.h

const EPS = 1e-6

/* ------------------------------------------------------------------ */
/* Items (expanded parts)                                              */
/* ------------------------------------------------------------------ */

export interface PartItem {
  spec: PartSpec
  /** Instance index within the part's quantity (for stable ids). */
  index: number
  label: string
  /** Natural (unrotated) width / height in mm. */
  w: number
  h: number
  material?: string
  canRotate: boolean
}

export function expandParts(parts: PartSpec[]): PartItem[] {
  const items: PartItem[] = []
  for (const spec of parts) {
    const qty = Math.max(0, Math.round(spec.qty || 0))
    for (let i = 0; i < qty; i++) {
      items.push({
        spec,
        index: i,
        label: spec.label,
        w: spec.width,
        h: spec.height,
        material: spec.material,
        canRotate: spec.canRotate,
      })
    }
  }
  return items
}

/* ------------------------------------------------------------------ */
/* Cutting tree                                                        */
/* ------------------------------------------------------------------ */

export interface PlacedPart {
  item: PartItem
  x: number
  y: number
  w: number
  h: number
  rotated: boolean
}

export type CutNode =
  | { kind: 'part'; rect: Rect; item: PartItem; rotated: boolean }
  | { kind: 'waste'; rect: Rect }
  | {
      kind: 'split'
      rect: Rect
      /** 'v' = vertical cut (spans the rect height), 'h' = horizontal cut */
      dir: 'v' | 'h'
      /** Distance of the cut from the rect's origin edge. */
      at: number
      kerf: number
      a: CutNode
      b: CutNode
    }

export interface SheetStats {
  sheetArea: number
  usedArea: number
  wastedArea: number
  wastePct: number
  cutCount: number
  cutLength: number
  panels: number
  wastePanels: number
}

export interface SheetLayout {
  /** Stock entry this sheet was cut from. */
  stock: StockSpec
  w: number
  h: number
  /** Geometry of the sheet inside the mosaic (0,0 for the first copy). */
  origin: { x: number; y: number }
  root: CutNode
  parts: PlacedPart[]
  stats: SheetStats
}

export interface CutStep {
  /** 1-based global cut number. */
  n: number
  /** Source panel label (sheet or sub-panel), with dims. */
  source: string
  /** Length of the cut (the span it crosses), mm. */
  length: number
  /** Distance from the source panel's origin edge, mm. */
  position: number
  /** Resulting panels after the cut. */
  results: { label: string; w: number; h: number }[]
}

export interface Mosaic {
  stock: StockSpec
  w: number
  h: number
  qty: number
  layouts: SheetLayout[]
  stats: SheetStats
  cuts: CutStep[]
}

export interface OptimizationResult {
  options: OptimizationOptions
  mosaics: Mosaic[]
  sheetsUsed: number
  stockArea: number
  usedArea: number
  wastedArea: number
  wastePct: number
  cutCount: number
  cutLength: number
  panels: number
  wastePanels: number
  /** Parts that could not be placed on any compatible stock. */
  unableToFit: PartItem[]
  /** ms actually spent computing. */
  elapsedMs: number
}

/* ------------------------------------------------------------------ */
/* Tree statistics                                                     */
/* ------------------------------------------------------------------ */

function collectParts(node: CutNode, out: PlacedPart[]): void {
  if (node.kind === 'part') {
    out.push({
      item: node.item,
      x: node.rect.x,
      y: node.rect.y,
      w: node.rect.w,
      h: node.rect.h,
      rotated: node.rotated,
    })
  } else if (node.kind === 'split') {
    collectParts(node.a, out)
    collectParts(node.b, out)
  }
}

interface TreeCounts {
  usedArea: number
  cutCount: number
  cutLength: number
  panels: number
  wastePanels: number
}

function countTree(node: CutNode): TreeCounts {
  if (node.kind === 'part') {
    return {
      usedArea: rectArea(node.rect),
      cutCount: 0,
      cutLength: 0,
      panels: 1,
      wastePanels: 0,
    }
  }
  if (node.kind === 'waste') {
    return { usedArea: 0, cutCount: 0, cutLength: 0, panels: 0, wastePanels: 1 }
  }
  const a = countTree(node.a)
  const b = countTree(node.b)
  return {
    usedArea: a.usedArea + b.usedArea,
    cutCount: a.cutCount + b.cutCount + 1,
    cutLength:
      a.cutLength + b.cutLength + (node.dir === 'v' ? node.rect.h : node.rect.w),
    panels: a.panels + b.panels,
    wastePanels: a.wastePanels + b.wastePanels,
  }
}

function computeSheetStats(w: number, h: number, root: CutNode): SheetStats {
  const c = countTree(root)
  const sheetArea = w * h
  const wastedArea = Math.max(0, sheetArea - c.usedArea)
  return {
    sheetArea,
    usedArea: c.usedArea,
    wastedArea,
    wastePct: sheetArea > 0 ? (wastedArea / sheetArea) * 100 : 0,
    cutCount: c.cutCount,
    cutLength: c.cutLength,
    panels: c.panels,
    wastePanels: c.wastePanels,
  }
}

/* ------------------------------------------------------------------ */
/* Search state                                                        */
/* ------------------------------------------------------------------ */

interface SheetState {
  stock: StockSpec
  w: number
  h: number
  free: Rect[]
  /** Current root of this sheet's cutting tree (mutated on placement). */
  root: CutNode
}

interface SearchState {
  sheets: SheetState[]
  placed: PlacedPart[]
  remaining: PartItem[]
  impossible: PartItem[]
  cutCount: number
  cutLength: number
  sheetArea: number
  placedArea: number
}

function initialState(items: PartItem[]): SearchState {
  return {
    sheets: [],
    placed: [],
    remaining: items,
    impossible: [],
    cutCount: 0,
    cutLength: 0,
    sheetArea: 0,
    placedArea: 0,
  }
}

function cloneState(s: SearchState): SearchState {
  return {
    sheets: s.sheets.map((sheet) => ({ ...sheet, free: sheet.free.slice() })),
    placed: s.placed.slice(),
    remaining: s.remaining.slice(),
    impossible: s.impossible.slice(),
    cutCount: s.cutCount,
    cutLength: s.cutLength,
    sheetArea: s.sheetArea,
    placedArea: s.placedArea,
  }
}

/** Remove rects fully contained in another free rect (dedupe fragmentation). */
function coalesceFree(rects: Rect[]): Rect[] {
  const kept: Rect[] = []
  for (const r of rects) {
    if (r.w <= EPS || r.h <= EPS) continue
    let contained = false
    for (const o of rects) {
      if (o === r) continue
      if (
        o.x <= r.x + EPS &&
        o.y <= r.y + EPS &&
        r.x + r.w <= o.x + o.w + EPS &&
        r.y + r.h <= o.y + o.h + EPS
      ) {
        contained = true
        break
      }
    }
    if (!contained) kept.push(r)
  }
  // Sort: bigger areas first (stable order keeps results deterministic).
  kept.sort((a, b) => rectArea(b) - rectArea(a) || a.x - b.x || a.y - b.y)
  return kept
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

/**
 * Place `pw × ph` into the top-left corner of region `rect` with kerf `k`.
 *
 * Two guillotine decompositions are offered:
 *  - vertical-first:  vertical cut at pw+k, then horizontal cut inside the
 *                     left strip (part + bottom leftover), right region free
 *  - horizontal-first: horizontal cut at ph+k, then vertical cut inside the
 *                     top strip (part + right leftover), bottom region free
 *
 * Degenerate residuals (≤ kerf / zero area) are dropped: a single cut can
 * separate the part directly, keeping the tree minimal (a strip of n parts
 * costs n+1 cuts, exactly like a real saw operator would make them).
 * Returns the tree, the real residuals, and the actual cuts performed
 * (count + summed span).
 */
function splitForPlacement(
  rect: Rect,
  pw: number,
  ph: number,
  k: number,
  item: PartItem,
  rotated: boolean,
  order: 'v' | 'h',
): { root: CutNode; residuals: Rect[]; cuts: number; cutLength: number } {
  const partRect: Rect = { x: rect.x, y: rect.y, w: pw, h: ph }
  const partNode: CutNode = { kind: 'part', rect: partRect, item, rotated }
  const rightW = rect.w - pw - k
  const bottomH = rect.h - ph - k
  const rightOk = rightW > EPS && rect.h > EPS
  const bottomOk = pw > EPS && bottomH > EPS

  if (order === 'v') {
    // Primary: vertical cut at pw. Secondary (in the left strip): horizontal
    // cut at ph separating the part from the bottom leftover.
    const right: CutNode = {
      kind: 'waste',
      rect: { x: rect.x + pw + k, y: rect.y, w: rightW, h: rect.h },
    }
    const bottom: CutNode = {
      kind: 'waste',
      rect: { x: rect.x, y: rect.y + ph + k, w: pw, h: bottomH },
    }
    let root: CutNode
    let cuts: number
    let cutLength: number
    if (rightOk && bottomOk) {
      root = {
        kind: 'split',
        rect: { ...rect },
        dir: 'v',
        at: pw,
        kerf: k,
        a: {
          kind: 'split',
          rect: { x: rect.x, y: rect.y, w: pw, h: rect.h },
          dir: 'h',
          at: ph,
          kerf: k,
          a: partNode,
          b: bottom,
        },
        b: right,
      }
      cuts = 2
      cutLength = rect.h + pw
    } else if (rightOk) {
      root = { kind: 'split', rect: { ...rect }, dir: 'v', at: pw, kerf: k, a: partNode, b: right }
      cuts = 1
      cutLength = rect.h
    } else if (bottomOk) {
      root = { kind: 'split', rect: { ...rect }, dir: 'h', at: ph, kerf: k, a: partNode, b: bottom }
      cuts = 1
      cutLength = pw
    } else {
      root = partNode
      cuts = 0
      cutLength = 0
    }
    const residuals: Rect[] = []
    if (rightOk) residuals.push(right.rect)
    if (bottomOk) residuals.push(bottom.rect)
    return { root, residuals, cuts, cutLength }
  }

  // Horizontal-first: primary horizontal cut at ph; secondary (in the top
  // strip) vertical cut at pw separating the part from the right leftover.
  const bottom: CutNode = {
    kind: 'waste',
    rect: { x: rect.x, y: rect.y + ph + k, w: rect.w, h: bottomH },
  }
  const right: CutNode = {
    kind: 'waste',
    rect: { x: rect.x + pw + k, y: rect.y, w: rightW, h: ph },
  }
  let root: CutNode
  let cuts: number
  let cutLength: number
  if (bottomOk && rightOk) {
    root = {
      kind: 'split',
      rect: { ...rect },
      dir: 'h',
      at: ph,
      kerf: k,
      a: {
        kind: 'split',
        rect: { x: rect.x, y: rect.y, w: rect.w, h: ph },
        dir: 'v',
        at: pw,
        kerf: k,
        a: partNode,
        b: right,
      },
      b: bottom,
    }
    cuts = 2
    cutLength = rect.w + ph
  } else if (bottomOk) {
    root = { kind: 'split', rect: { ...rect }, dir: 'h', at: ph, kerf: k, a: partNode, b: bottom }
    cuts = 1
    cutLength = rect.w
  } else if (rightOk) {
    root = { kind: 'split', rect: { ...rect }, dir: 'v', at: pw, kerf: k, a: partNode, b: right }
    cuts = 1
    cutLength = ph
  } else {
    root = partNode
    cuts = 0
    cutLength = 0
  }
  const residuals: Rect[] = []
  if (bottomOk) residuals.push(bottom.rect)
  if (rightOk) residuals.push(right.rect)
  return { root, residuals, cuts, cutLength }
}

/** Orientations of an item: natural + optionally rotated (dedup'd). */
function orientationsOf(item: PartItem, options: OptimizationOptions): { w: number; h: number; rotated: boolean }[] {
  const allow = item.canRotate && options.canRotate
  const out = [{ w: item.w, h: item.h, rotated: false }]
  if (allow && item.w !== item.h) {
    out.push({ w: item.h, h: item.w, rotated: true })
  }
  return out
}

/** Split orders, honoring the preferred cut direction. */
function splitOrdersOf(options: OptimizationOptions): ('v' | 'h')[] {
  if (options.preferredCutDirection === 'horizontal') return ['h', 'v']
  if (options.preferredCutDirection === 'vertical') return ['v', 'h']
  return ['v', 'h']
}

function fitsIn(rect: Rect, w: number, h: number): boolean {
  return w <= rect.w + EPS && h <= rect.h + EPS
}

/* ------------------------------------------------------------------ */
/* Stock compatibility                                                 */
/* ------------------------------------------------------------------ */

function materialMatches(
  partMaterial: string | undefined,
  stockMaterial: string | undefined,
  options: OptimizationOptions,
): boolean {
  if (!options.considerMaterials) return true
  return (partMaterial ?? '') === (stockMaterial ?? '')
}

function partFitsStock(
  item: PartItem,
  stock: StockSpec,
  options: OptimizationOptions,
): boolean {
  if (!materialMatches(item.material, stock.material, options)) return false
  const o = orientationsOf(item, options)
  return o.some(({ w, h }) => w <= stock.width + EPS && h <= stock.height + EPS)
}

/** Stock entries that can physically host this item. */
function compatibleStocks(
  item: PartItem,
  stocks: StockSpec[],
  options: OptimizationOptions,
): StockSpec[] {
  return stocks.filter((s) => partFitsStock(item, s, options))
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

interface ScoreParts {
  sheetArea: number
  freeCount: number
  cutCount: number
  cutLength: number
  placedArea: number
  remaining: PartItem[]
  sheets: SheetState[]
  options: OptimizationOptions
}

/** Beam heuristic for a partial state — lower is better. */
function heuristicScore(sp: ScoreParts): number {
  const { options } = sp
  let score = sp.sheetArea
  score += sp.freeCount * 2
  score += sp.cutLength * 0.002
  if (options.priority === 'fewestCuts') {
    score += sp.cutCount * 40
  } else {
    score += sp.cutCount * 0.4
  }
  // Future-fit: if the largest remaining part fits no current free region,
  // the state is heading toward another sheet or a dead end.
  if (sp.remaining.length > 0) {
    let largest: PartItem | null = null
    for (const item of sp.remaining) {
      if (!largest || item.w * item.h > largest.w * largest.h) largest = item
    }
    if (largest) {
      const fits = sp.sheets.some((sheet) =>
        sheet.free.some((rect) =>
          orientationsOf(largest, options).some(
            ({ w, h }) => fitsIn(rect, w, h) || fitsIn(rect, h, w),
          ),
        ),
      )
      if (!fits) score += 1_000_000
    }
  }
  return score
}

/** Cheap candidate pre-sort key — lower is better. */
function cheapCandidateScore(
  rect: Rect,
  w: number,
  h: number,
  openingSheetArea: number | null,
): number {
  if (openingSheetArea !== null) {
    // Opening a fresh sheet: cost ≈ leftover on that sheet.
    return openingSheetArea - w * h + openingSheetArea * 0.05
  }
  return rectArea(rect) - w * h
}

/* ------------------------------------------------------------------ */
/* Priority comparison of complete solutions                           */
/* ------------------------------------------------------------------ */

interface SolutionMetrics {
  wasteArea: number
  sheetCount: number
  cutCount: number
  cutLength: number
  largestSheetArea: number
}

function metricsOf(state: SearchState): SolutionMetrics {
  const sheetCount = state.sheets.length
  let largestSheetArea = 0
  for (const s of state.sheets) largestSheetArea = Math.max(largestSheetArea, s.w * s.h)
  const stockArea = state.sheetArea
  const wasteArea = Math.max(0, stockArea - state.placedArea)
  return { wasteArea, sheetCount, cutCount: state.cutCount, cutLength: state.cutLength, largestSheetArea }
}

function compareSolutions(
  a: SolutionMetrics,
  b: SolutionMetrics,
  priority: OptimizationPriority,
): number {
  const tuples: Record<OptimizationPriority, (m: SolutionMetrics) => number[]> = {
    leastWaste: (m) => [m.wasteArea, m.sheetCount, m.cutCount, m.cutLength],
    fewestCuts: (m) => [m.cutCount, m.wasteArea, m.cutLength, m.sheetCount],
    smallerStockFirst: (m) => [
      m.sheetCount,
      m.largestSheetArea,
      m.wasteArea,
      m.cutCount,
      m.cutLength,
    ],
  }
  const ta = tuples[priority](a)
  const tb = tuples[priority](b)
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) return ta[i] - tb[i]
  }
  return 0
}

/* ------------------------------------------------------------------ */
/* Strategy orderings                                                  */
/* ------------------------------------------------------------------ */

type OrderKind =
  | 'areaDesc'
  | 'areaAsc'
  | 'widthDesc'
  | 'heightDesc'
  | 'maxSideDesc'
  | 'shortSideDesc'
  | 'random1'
  | 'random2'

function orderItems(items: PartItem[], kind: OrderKind, rand: () => number): PartItem[] {
  const copy = items.slice()
  switch (kind) {
    case 'areaDesc':
      return copy.sort((a, b) => b.w * b.h - a.w * a.h)
    case 'areaAsc':
      return copy.sort((a, b) => a.w * a.h - b.w * b.h)
    case 'widthDesc':
      return copy.sort((a, b) => b.w - a.w || b.h - a.h)
    case 'heightDesc':
      return copy.sort((a, b) => b.h - a.h || b.w - a.w)
    case 'maxSideDesc':
      return copy.sort(
        (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
      )
    case 'shortSideDesc':
      return copy.sort(
        (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.w * b.h - a.w * a.h,
      )
    case 'random1':
    case 'random2':
      return seededShuffle(copy, rand)
  }
}

const ALL_ORDERS: OrderKind[] = [
  'areaDesc',
  'maxSideDesc',
  'widthDesc',
  'shortSideDesc',
  'heightDesc',
  'areaAsc',
  'random1',
  'random2',
]

/* ------------------------------------------------------------------ */
/* Beam search                                                         */
/* ------------------------------------------------------------------ */

interface Candidate {
  item: PartItem
  sheetIdx: number
  /** Free rect index within the sheet, or -1 when opening a new sheet. */
  rectIdx: number
  w: number
  h: number
  rotated: boolean
  order: 'v' | 'h'
  /** New stock to open, or null when placing into an existing sheet. */
  openStock: StockSpec | null
  /** Cheap pre-sort key — lower is better. */
  cost: number
}

/** Whether opening another sheet of this stock is still allowed. */
function stockAvailable(state: SearchState, stock: StockSpec): boolean {
  if (stock.qty <= 0) return false
  const opened = state.sheets.filter((s) => s.stock.id === stock.id).length
  return opened < stock.qty
}

function applyCandidate(state: SearchState, cand: Candidate, options: OptimizationOptions): SearchState {
  const next = cloneState(state)
  const k = options.kerf

  if (cand.openStock) {
    const stock = cand.openStock
    const sheet: SheetState = {
      stock,
      w: stock.width,
      h: stock.height,
      free: [{ x: 0, y: 0, w: stock.width, h: stock.height }],
      root: { kind: 'waste', rect: { x: 0, y: 0, w: stock.width, h: stock.height } },
    }
    next.sheets.push(sheet)
    next.sheetArea += stock.width * stock.height
    const idx = next.sheets.length - 1
    cand = { ...cand, sheetIdx: idx, rectIdx: 0, openStock: null }
    // Fall through: the new sheet's only free rect is index 0.
    const placed = placeIntoSheet(next, cand, k)
    if (!placed) return state // cannot happen for a compatible stock
    return next
  }

  const placed = placeIntoSheet(next, cand, k)
  if (!placed) return state
  return next
}

/** Mutates `state` in place (it is already a clone). Returns false on failure. */
function placeIntoSheet(state: SearchState, cand: Candidate, k: number): boolean {
  const sheet = state.sheets[cand.sheetIdx]
  if (!sheet) return false
  const rect = sheet.free[cand.rectIdx]
  if (!rect || !fitsIn(rect, cand.w, cand.h)) return false

  const { root, residuals, cuts, cutLength } = splitForPlacement(
    rect,
    cand.w,
    cand.h,
    k,
    cand.item,
    cand.rotated,
    cand.order,
  )

  // Rebuild the sheet's tree: the placed rect becomes the new subtree root.
  // Because free rects are disjoint and each belongs to exactly one subtree,
  // we can swap the root node of the whole sheet to keep the tree valid only
  // if this rect's subtree IS the sheet root. Simpler: maintain the tree by
  // splicing — here we attach the new split as a sibling subtree. To keep the
  // representation exact we instead rebuild by finding the waste leaf that
  // owns this rect and replacing it.
  const replaced = replaceWasteNode(sheet.root, rect, root)
  if (replaced) sheet.root = replaced

  // Update free list.
  const free = sheet.free.slice()
  free.splice(cand.rectIdx, 1)
  free.push(...residuals)
  sheet.free = coalesceFree(free)

  state.placed.push({
    item: cand.item,
    x: rect.x,
    y: rect.y,
    w: cand.w,
    h: cand.h,
    rotated: cand.rotated,
  })
  state.placedArea += cand.w * cand.h
  state.cutCount += cuts
  state.cutLength += cutLength
  state.remaining = state.remaining.filter((it) => it !== cand.item)
  return true
}

/**
 * Find the waste leaf whose rect matches `rect` and replace it with `replacement`.
 * Returns null if no such leaf is found (should not happen in practice).
 */
function replaceWasteNode(node: CutNode, rect: Rect, replacement: CutNode): CutNode | null {
  if (node.kind === 'waste') {
    if (
      Math.abs(node.rect.x - rect.x) < EPS &&
      Math.abs(node.rect.y - rect.y) < EPS &&
      Math.abs(node.rect.w - rect.w) < EPS &&
      Math.abs(node.rect.h - rect.h) < EPS
    ) {
      return replacement
    }
    return null
  }
  if (node.kind === 'part') return null
  const ra = replaceWasteNode(node.a, rect, replacement)
  if (ra) return { ...node, a: ra }
  const rb = replaceWasteNode(node.b, rect, replacement)
  if (rb) return { ...node, b: rb }
  return null
}

function expandState(
  state: SearchState,
  stocks: StockSpec[],
  options: OptimizationOptions,
  cap: number,
): SearchState[] {
  const cands: Candidate[] = []
  const orders = splitOrdersOf(options)

  for (const item of state.remaining) {
    const orientations = orientationsOf(item, options)

    // Existing open sheets.
    for (let si = 0; si < state.sheets.length; si++) {
      const sheet = state.sheets[si]
      for (let ri = 0; ri < sheet.free.length; ri++) {
        const rect = sheet.free[ri]
        for (const { w, h, rotated } of orientations) {
          if (!fitsIn(rect, w, h)) continue
          const base = cheapCandidateScore(rect, w, h, null)
          for (const order of orders) {
            cands.push({
              item,
              sheetIdx: si,
              rectIdx: ri,
              w,
              h,
              rotated,
              order,
              openStock: null,
              cost: base + (order === orders[0] ? 0 : 5),
            })
          }
        }
      }
    }

    // Opening a new sheet: only consider when the item fits no open sheet.
    const fitsAnyOpen = state.sheets.some((sheet) =>
      sheet.free.some((rect) => orientations.some(({ w, h }) => fitsIn(rect, w, h))),
    )
    if (!fitsAnyOpen) {
      const compat = compatibleStocks(item, stocks, options)
      const pool = compat.filter((s) => stockAvailable(state, s)).slice()
      if (options.priority === 'fewestCuts') {
        pool.sort((a, b) => b.width * b.height - a.width * a.height)
      } else {
        pool.sort((a, b) => a.width * a.height - b.width * b.height)
      }
      // Beam diversity: try the two best (or all when few).
      const openingPool = pool.slice(0, Math.min(2, pool.length))
      for (const stock of openingPool) {
        const sheetArea = stock.width * stock.height
        for (const { w, h, rotated } of orientations) {
          if (!fitsIn({ x: 0, y: 0, w: stock.width, h: stock.height }, w, h)) continue
          const base = cheapCandidateScore(
            { x: 0, y: 0, w: stock.width, h: stock.height },
            w,
            h,
            sheetArea,
          )
          for (const order of orders) {
            cands.push({
              item,
              sheetIdx: -1,
              rectIdx: -1,
              w,
              h,
              rotated,
              order,
              openStock: stock,
              cost: base + (order === orders[0] ? 0 : 5),
            })
          }
        }
      }
    }
  }

  if (cands.length === 0) return []

  // Sort by cheap cost, keep the best `cap`, then apply.
  cands.sort((a, b) => a.cost - b.cost)
  const picked = cands.slice(0, cap)
  const out: SearchState[] = []
  for (const cand of picked) {
    const next = applyCandidate(state, cand, options)
    if (next !== state) out.push(next)
  }
  // Sort successors by heuristic (ties broken deterministically by part order).
  const scored = out.map((s) => ({
    s,
    h: heuristicScore({
      sheetArea: s.sheetArea,
      freeCount: s.sheets.reduce((n, sh) => n + sh.free.length, 0),
      cutCount: s.cutCount,
      cutLength: s.cutLength,
      placedArea: s.placedArea,
      remaining: s.remaining,
      sheets: s.sheets,
      options,
    }),
  }))
  scored.sort((a, b) => a.h - b.h || a.s.cutLength - b.s.cutLength)
  return scored.map(({ s }) => s)
}

/** Greedy cleanup: place whatever the beam left behind. */
function cleanupState(state: SearchState, stocks: StockSpec[], options: OptimizationOptions): SearchState {
  const next = cloneState(state)
  const orders = splitOrdersOf(options)
  let remaining = next.remaining.slice()

  while (remaining.length > 0) {
    let progress = false
    for (const item of remaining) {
      const orientations = orientationsOf(item, options)
      // Best fit across open sheets.
      let best:
        | { sheetIdx: number; rectIdx: number; w: number; h: number; rotated: boolean; cost: number }
        | null = null
      for (let si = 0; si < next.sheets.length; si++) {
        const sheet = next.sheets[si]
        for (let ri = 0; ri < sheet.free.length; ri++) {
          const rect = sheet.free[ri]
          for (const { w, h, rotated } of orientations) {
            if (!fitsIn(rect, w, h)) continue
            const cost = cheapCandidateScore(rect, w, h, null)
            if (!best || cost < best.cost) {
              best = { sheetIdx: si, rectIdx: ri, w, h, rotated, cost }
            }
          }
        }
      }
      if (best) {
        const cand: Candidate = {
          item,
          sheetIdx: best.sheetIdx,
          rectIdx: best.rectIdx,
          w: best.w,
          h: best.h,
          rotated: best.rotated,
          order: orders[0],
          openStock: null,
          cost: 0,
        }
        placeIntoSheet(next, cand, options.kerf)
        progress = true
        remaining = remaining.filter((it) => it !== item)
        continue
      }
      // Try opening a new sheet (smallest compatible stock first).
      const compat = compatibleStocks(item, stocks, options)
        .filter((s) => stockAvailable(next, s))
        .sort((a, b) => a.width * a.height - b.width * b.height)
      const fit = compat
        .map((s) => ({ s, o: orientations.find((o) => fitsIn({ x: 0, y: 0, w: s.width, h: s.height }, o.w, o.h)) }))
        .find((f): f is { s: StockSpec; o: { w: number; h: number; rotated: boolean } } => !!f.o)
      if (fit) {
        const sheet: SheetState = {
          stock: fit.s,
          w: fit.s.width,
          h: fit.s.height,
          free: [{ x: 0, y: 0, w: fit.s.width, h: fit.s.height }],
          root: {
            kind: 'waste',
            rect: { x: 0, y: 0, w: fit.s.width, h: fit.s.height },
          },
        }
        const idx = next.sheets.length
        next.sheets.push(sheet)
        next.sheetArea += fit.s.width * fit.s.height
        const placed = placeIntoSheet(
          next,
          {
            item,
            sheetIdx: idx,
            rectIdx: 0,
            w: fit.o.w,
            h: fit.o.h,
            rotated: fit.o.rotated,
            order: orders[0],
            openStock: null,
            cost: 0,
          },
          options.kerf,
        )
        if (placed) {
          progress = true
          remaining = remaining.filter((it) => it !== item)
          continue
        }
      }
      next.impossible.push(item)
      remaining = remaining.filter((it) => it !== item)
    }
    if (!progress) {
      // Nothing placed this pass → avoid infinite loop.
      next.impossible.push(...remaining)
      remaining = []
    }
  }
  return next
}

/* ------------------------------------------------------------------ */
/* Group optimization                                                  */
/* ------------------------------------------------------------------ */

const BEAM_WIDTH = 80
const CANDIDATES_PER_STATE = 64

function optimizeGroup(
  items: PartItem[],
  stocks: StockSpec[],
  options: OptimizationOptions,
  deadline: number,
  seed: number,
): SearchState | null {
  const rng = mulberry32(seed)
  let best: SearchState | null = null

  // Globally impossible parts (no compatible stock) are never searched.
  const searchable = items.filter((item) => {
    const ok = compatibleStocks(item, stocks, options).length > 0
    return ok
  })
  const preImpossible = items.filter((item) => !searchable.includes(item))

  for (const orderKind of ALL_ORDERS) {
    if (performance.now() > deadline) break
    const ordered = orderItems(searchable, orderKind, rng)
    let beam: SearchState[] = [initialState(ordered)]
    let bestComplete: SearchState | null = null
    const seen = new Set<string>()
    const maxSteps = ordered.length + 4

    for (let step = 0; step < maxSteps && beam.length > 0; step++) {
      if (performance.now() > deadline) break
      const next: SearchState[] = []
      let expandedAny = false

      for (const state of beam) {
        if (state.remaining.length === 0) {
          if (!bestComplete || compareSolutions(metricsOf(state), metricsOf(bestComplete), options.priority) < 0) {
            bestComplete = state
          }
          continue
        }
        const succs = expandState(state, stocks, options, CANDIDATES_PER_STATE)
        if (succs.length > 0) {
          expandedAny = true
          next.push(...succs)
        }
      }

      if (!expandedAny) break

      // Sort by heuristic and keep the beam.
      const scored = next
        .map((s) => ({
          s,
          h: heuristicScore({
            sheetArea: s.sheetArea,
            freeCount: s.sheets.reduce((n, sh) => n + sh.free.length, 0),
            cutCount: s.cutCount,
            cutLength: s.cutLength,
            placedArea: s.placedArea,
            remaining: s.remaining,
            sheets: s.sheets,
            options,
          }),
        }))
        .sort((a, b) => a.h - b.h)
      const picked: SearchState[] = []
      for (const { s } of scored) {
        const key = stateKey(s)
        if (seen.has(key)) continue
        seen.add(key)
        picked.push(s)
        if (picked.length >= BEAM_WIDTH) break
      }
      beam = picked
      // Early exit when the beam is all-complete and we've hit the lower bound.
      const complete = beam.filter((s) => s.remaining.length === 0)
      if (complete.length > 0) {
        for (const s of complete) {
          if (!bestComplete || compareSolutions(metricsOf(s), metricsOf(bestComplete), options.priority) < 0) {
            bestComplete = s
          }
        }
        // Keep searching a little longer for a better layout within budget.
      }
    }

    const base = bestComplete ?? beam[0] ?? initialState(ordered)
    const cleaned = cleanupState(base, stocks, options)
    cleaned.impossible.push(...preImpossible.filter((p) => !cleaned.impossible.includes(p)))
    if (!best || compareSolutions(metricsOf(cleaned), metricsOf(best), options.priority) < 0) {
      best = cleaned
    }
  }

  return best
}

/** Compact signature of a state for beam dedup. */
function stateKey(s: SearchState): string {
  const placed = s.placed
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h)
  const placedKey = placed
    .map((p) =>
      `${p.item.spec.id}#${p.item.index}@${p.x.toFixed(1)},${p.y.toFixed(1)}|${p.w.toFixed(1)}x${p.h.toFixed(1)}`,
    )
    .join(';')
  // The free-rect arrangement matters: identical placed parts can sit on
  // different residual layouts (e.g. vertical-first vs horizontal-first
  // splits), which changes what can still fit.
  const freeKey = s.sheets
    .map((sh) =>
      sh.free
        .slice()
        .sort((a, b) => a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h)
        .map((r) => `${r.x.toFixed(1)},${r.y.toFixed(1)},${r.w.toFixed(1)},${r.h.toFixed(1)}`)
        .join('&'),
    )
    .join('|')
  return `${placedKey}||${freeKey}`
}

/* ------------------------------------------------------------------ */
/* Result assembly                                                     */
/* ------------------------------------------------------------------ */

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/** Pre-order traversal of a sheet's tree producing its cut sequence. */
function cutsOfTree(root: CutNode, sheetLabelArg: string): CutStep[] {
  const steps: CutStep[] = []
  let n = 0
  const visit = (node: CutNode, sourceLabel: string): void => {
    if (node.kind !== 'split') return
    n += 1
    const aLabel = childLabel(node.a)
    const bLabel = childLabel(node.b)
    steps.push({
      n,
      source: sourceLabel,
      length: node.dir === 'v' ? round2(node.rect.h) : round2(node.rect.w),
      position: round2(node.at),
      results: [
        { label: aLabel.label, w: aLabel.w, h: aLabel.h },
        { label: bLabel.label, w: bLabel.w, h: bLabel.h },
      ],
    })
    visit(node.a, aLabel.label)
    visit(node.b, bLabel.label)
  }
  visit(root, sheetLabelArg)
  return steps
}

function childLabel(node: CutNode): { label: string; w: number; h: number } {
  if (node.kind === 'part') {
    const name = node.item.label || 'Part'
    const w = round2(node.rect.w)
    const h = round2(node.rect.h)
    return { label: `${name} ${w}×${h}`, w, h }
  }
  if (node.kind === 'waste') {
    const w = round2(node.rect.w)
    const h = round2(node.rect.h)
    return { label: `Waste ${w}×${h}`, w, h }
  }
  const w = round2(node.rect.w)
  const h = round2(node.rect.h)
  return { label: `Panel ${w}×${h}`, w, h }
}

/** Builds sheets from a search state, preserving deterministic order. */
function sheetsFromState(state: SearchState): SheetLayout[] {
  return state.sheets.map((sheet) => {
    const parts: PlacedPart[] = []
    collectParts(sheet.root, parts)
    const stats = computeSheetStats(sheet.w, sheet.h, sheet.root)
    return {
      stock: sheet.stock,
      w: sheet.w,
      h: sheet.h,
      origin: { x: 0, y: 0 },
      root: sheet.root,
      parts,
      stats,
    }
  })
}

/** Groups identical sheet layouts into mosaics. */
function groupMosaics(sheets: SheetLayout[]): Mosaic[] {
  const mosaics: Mosaic[] = []
  const byKey = new Map<string, Mosaic>()
  for (const sheet of sheets) {
    const key = signature(sheet)
    const existing = byKey.get(key)
    if (existing) {
      existing.qty += 1
      existing.layouts.push(sheet)
      continue
    }
    const mosaic: Mosaic = {
      stock: sheet.stock,
      w: sheet.w,
      h: sheet.h,
      qty: 1,
      layouts: [sheet],
      stats: { ...sheet.stats },
      cuts: cutsOfTree(sheet.root, `${sheet.stock.label} ${sheet.w}×${sheet.h}`),
    }
    byKey.set(key, mosaic)
    mosaics.push(mosaic)
  }
  return mosaics
}

function signature(sheet: SheetLayout): string {
  const parts = sheet.parts
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h)
  return `${sheet.stock.id}|${parts
    .map((p) => `${p.item.spec.id}#${p.item.index}|${p.x.toFixed(1)}|${p.y.toFixed(1)}|${p.w.toFixed(1)}|${p.h.toFixed(1)}`)
    .join(';')}`
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function optimize(
  parts: PartSpec[],
  stocks: StockSpec[],
  options: OptimizationOptions,
): OptimizationResult {
  const started = performance.now()
  // Drop degenerate specs (non-positive dimensions) up front — they can never
  // be cut and would corrupt the search.
  const items = expandParts(parts).filter(
    (item) => item.w > 0 && item.h > 0,
  )
  const degenerate = expandParts(parts).filter(
    (item) => item.w <= 0 || item.h <= 0,
  )

  // Groups by material when enabled.
  let groups: { key: string; items: PartItem[]; stocks: StockSpec[] }[] = []
  if (options.considerMaterials) {
    const byMat = new Map<string, PartItem[]>()
    for (const item of items) {
      const key = item.material ?? ''
      const list = byMat.get(key)
      if (list) list.push(item)
      else byMat.set(key, [item])
    }
    for (const [key, list] of byMat) {
      const compatible = stocks.filter((s) => (s.material ?? '') === key)
      groups.push({ key, items: list, stocks: compatible })
    }
  } else {
    groups = [{ key: '', items, stocks }]
  }

  const states: SearchState[] = []
  const deadline = started + options.timeBudgetMs

  for (const group of groups) {
    const seed = (options.seed + hashString(group.key)) >>> 0
    if (group.stocks.length === 0) {
      // No stock at all for this material — everything is impossible.
      const st = initialState(group.items)
      st.impossible = group.items.slice()
      states.push(st)
      continue
    }
    if (options.forceOneSheet) {
      const res = optimizeOneSheet(group.items, group.stocks, options, deadline, seed)
      states.push(res)
    } else {
      const res = optimizeGroup(group.items, group.stocks, options, deadline, seed)
      states.push(res ?? initialState(group.items))
    }
  }

  const sheets: SheetLayout[] = []
  const unableToFit: PartItem[] = [...degenerate]
  for (const st of states) {
    sheets.push(...sheetsFromState(st))
    unableToFit.push(...st.impossible)
  }

  // One-sheet mode: whatever did not fit is reported as unable to fit.
  if (options.forceOneSheet) {
    for (const st of states) {
      unableToFit.push(...st.remaining)
    }
  }

  const mosaics = groupMosaics(sheets)

  let stockArea = 0
  let usedArea = 0
  let cutCount = 0
  let cutLength = 0
  let panels = 0
  let wastePanels = 0
  for (const m of mosaics) {
    stockArea += m.stats.sheetArea * m.qty
    usedArea += m.stats.usedArea * m.qty
    cutCount += m.stats.cutCount * m.qty
    cutLength += m.stats.cutLength * m.qty
    panels += m.stats.panels * m.qty
    wastePanels += m.stats.wastePanels * m.qty
  }
  const wastedArea = Math.max(0, stockArea - usedArea)
  const sheetsUsed = sheets.length
  // Renumber cuts globally across mosaics.
  let seq = 0
  for (const m of mosaics) {
    for (const c of m.cuts) {
      seq += 1
      c.n = seq
    }
  }

  return {
    options,
    mosaics,
    sheetsUsed,
    stockArea,
    usedArea,
    wastedArea,
    wastePct: stockArea > 0 ? (wastedArea / stockArea) * 100 : 0,
    cutCount,
    cutLength,
    panels,
    wastePanels,
    unableToFit,
    elapsedMs: performance.now() - started,
  }
}

/** One-sheet mode: single sheet, max placement, leftovers reported. */
function optimizeOneSheet(
  items: PartItem[],
  stocks: StockSpec[],
  options: OptimizationOptions,
  deadline: number,
  seed: number,
): SearchState {
  const rng = mulberry32(seed)
  const searchable = items.filter((item) => compatibleStocks(item, stocks, options).length > 0)
  const preImpossible = items.filter((item) => !searchable.includes(item))
  const ordered = orderItems(searchable, 'areaDesc', rng)
  const orders = splitOrdersOf(options)
  const state = initialState(ordered)

  if (ordered.length > 0) {
    const sheetStock = stocks
      .filter((s) => compatibleStocks(ordered[0], [s], options).length > 0)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0]
    if (sheetStock) {
      const sheet: SheetState = {
        stock: sheetStock,
        w: sheetStock.width,
        h: sheetStock.height,
        free: [{ x: 0, y: 0, w: sheetStock.width, h: sheetStock.height }],
        root: {
          kind: 'waste',
          rect: { x: 0, y: 0, w: sheetStock.width, h: sheetStock.height },
        },
      }
      state.sheets.push(sheet)
      state.sheetArea += sheetStock.width * sheetStock.height
    }
  }

  // Greedy best-fit with a few restarts for quality.
  let bestState: SearchState = cloneState(state)
  for (let attempt = 0; attempt < 6; attempt++) {
    if (performance.now() > deadline) break
    const attemptState = cloneState(state)
    const attemptOrder =
      attempt === 0 ? ordered.slice() : orderItems(searchable, ALL_ORDERS[(attempt * 3) % ALL_ORDERS.length], rng)
    for (const item of attemptOrder) {
      const orientations = orientationsOf(item, options)
      let best:
        | { sheetIdx: number; rectIdx: number; w: number; h: number; rotated: boolean; cost: number }
        | null = null
      for (let si = 0; si < attemptState.sheets.length; si++) {
        const sheet = attemptState.sheets[si]
        for (let ri = 0; ri < sheet.free.length; ri++) {
          const rect = sheet.free[ri]
          for (const { w, h, rotated } of orientations) {
            if (!fitsIn(rect, w, h)) continue
            const cost = cheapCandidateScore(rect, w, h, null)
            if (!best || cost < best.cost) best = { sheetIdx: si, rectIdx: ri, w, h, rotated, cost }
          }
        }
      }
      if (best) {
        placeIntoSheet(attemptState, { item, ...best, order: orders[0], openStock: null }, options.kerf)
      }
    }
    if (compareSolutions(metricsOf(attemptState), metricsOf(bestState), options.priority) < 0) {
      bestState = attemptState
    }
  }
  bestState.impossible.push(...preImpossible)
  return bestState
}
