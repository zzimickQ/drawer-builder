/** A panel to cut. Dimensions are the face (length × width) in mm. */
export interface PartSpec {
  id: string
  label: string
  width: number
  height: number
  qty: number
  material?: string
  /** Whether a 90° rotation is permitted during nesting. */
  canRotate: boolean
}

/** A stock sheet format. Dimensions in mm. */
export interface StockSpec {
  id: string
  label: string
  width: number
  height: number
  qty: number
  material?: string
}

export type OptimizationPriority = 'leastWaste' | 'fewestCuts' | 'smallerStockFirst'

export type CutDirection = 'none' | 'horizontal' | 'vertical'

export interface OptimizationOptions {
  /** Saw blade thickness in mm. Consumed between adjacent panels. */
  kerf: number
  /** Group parts and stock by material (a part never crosses materials). */
  considerMaterials: boolean
  /** Global default for allowing 90° rotation (per-part flag overrides). */
  canRotate: boolean
  /** Use only a single stock sheet; remaining parts are reported unplaced. */
  forceOneSheet: boolean
  priority: OptimizationPriority
  /** Preferred orientation of the first (longest) cut of each placement. */
  preferredCutDirection: CutDirection
  /** Total compute budget for the whole job, in ms. */
  timeBudgetMs: number
  /** Seed for the deterministic PRNG (randomized strategies). */
  seed: number
}

export const DEFAULT_OPTIONS: OptimizationOptions = {
  kerf: 3,
  considerMaterials: false,
  canRotate: true,
  forceOneSheet: false,
  priority: 'leastWaste',
  preferredCutDirection: 'none',
  timeBudgetMs: 2500,
  seed: 1,
}

export const PRIORITY_LABEL: Record<OptimizationPriority, string> = {
  leastWaste: 'Least wasted area',
  fewestCuts: 'Fewest cuts',
  smallerStockFirst: 'Smaller stock sheets first',
}

export const CUT_DIRECTION_LABEL: Record<CutDirection, string> = {
  none: 'No preference',
  horizontal: 'Horizontal cuts first',
  vertical: 'Vertical cuts first',
}
