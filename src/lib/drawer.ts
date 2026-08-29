import { UNIT_LABEL, formatMm, type DisplayUnit } from '@/lib/units'

export type FaceType = 'inset' | 'outset'

export interface DrawerConfig {
  /** Opening (carcass) width in mm */
  openingW: number
  /** Opening height in mm */
  openingH: number
  /** Opening depth in mm */
  openingD: number
  /** Drawer slide rail thickness in mm */
  slideThickness: number
  /** Drawer box panel (sides + back) material thickness in mm */
  boxThickness: number
  /** Drawer bottom panel thickness in mm */
  bottomThickness: number
  /** Face attachment panel thickness in mm */
  faceThickness: number
  /** Face style: flush with opening (inset) or overlapping carcass (outset) */
  faceType: FaceType
  /** Outset face overhang on each side (left/right) in mm */
  outsetSides: number
  /** Outset face overhang on top and bottom in mm */
  outsetTopBottom: number
  /** Drawer pull-out amount, 0–100 (%) */
  pullOut: number
}

export const DEFAULT_CONFIG: DrawerConfig = {
  openingW: 500,
  openingH: 160,
  openingD: 520,
  slideThickness: 10,
  boxThickness: 12,
  bottomThickness: 8,
  faceThickness: 18,
  faceType: 'inset',
  outsetSides: 20,
  outsetTopBottom: 10,
  pullOut: 0,
}

/**
 * Construction defaults configured once on first launch and applied to
 * every newly created drawer.
 */
export type DrawerDefaults = Pick<
  DrawerConfig,
  | 'slideThickness'
  | 'boxThickness'
  | 'bottomThickness'
  | 'faceType'
  | 'faceThickness'
>

export const DEFAULT_DEFAULTS: DrawerDefaults = {
  slideThickness: 13,
  boxThickness: 18,
  bottomThickness: 6,
  faceType: 'outset',
  faceThickness: 18,
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/* ------------------------------------------------------------------ */
/* Construction constants                                              */
/* ------------------------------------------------------------------ */

/** Carcass wall thickness (mm) */
export const CARCASS_T = 18
/** Gap left at the back of the carcass for slide travel (mm) */
export const BACK_CLEARANCE = 10
/** Height of the bottom panel top face above the box bottom edge (mm) */
export const DADO_INSET = 6
/** Dado groove depth for the bottom panel (mm) */
export const DADO_DEPTH = 8
/** Dado groove visual depth in the 3D view (mm) */
export const DADO_VISIBLE = 5

export const JOINERY_NOTE = `Bottom panel rides in ${DADO_DEPTH} mm dados (${DADO_INSET} mm inset) routed across all four panels; front and back butt-joint between the sides with glue and screws.`

/* ------------------------------------------------------------------ */
/* Derived dimensions and boards                                       */
/* ------------------------------------------------------------------ */

export interface DrawerDims {
  /** Drawer box outer width (mm) */
  drawerW: number
  /** Drawer box outer height (mm) */
  drawerH: number
  /** Drawer box outer depth (mm) — inclusive of the face for inset style */
  drawerD: number
  /** Drawer box panel depth (mm) — reduced by the face thickness when inset */
  boxDepth: number
  /** Z offset of the box front relative to the carcass front (mm) */
  boxZOffset: number
  /** Face attachment width (mm) */
  faceW: number
  /** Face attachment height (mm) */
  faceH: number
  /** Face attachment thickness (mm) */
  faceThickness: number
}

export function computeDims(config: DrawerConfig): DrawerDims {
  const drawerW = Math.max(1, config.openingW - 2 * config.slideThickness)
  const drawerH = Math.max(1, config.openingH - 6)
  const drawerD = Math.max(1, config.openingD - BACK_CLEARANCE)
  const isOutset = config.faceType === 'outset'
  const faceThickness = Math.max(1, config.faceThickness)
  // Inset style: the drawer's depth is inclusive of the face, so the box is
  // shallower by the face thickness and the whole assembly (face + box) sits
  // within the carcass, with the face taken in so its front is flush.
  const boxDepth = isOutset ? drawerD : Math.max(1, drawerD - faceThickness)
  const boxZOffset = isOutset ? 0 : -faceThickness
  const faceW = isOutset ? config.openingW + 2 * config.outsetSides : config.openingW
  const faceH =
    isOutset ? config.openingH + 2 * config.outsetTopBottom : config.openingH
  return {
    drawerW,
    drawerH,
    drawerD,
    boxDepth,
    boxZOffset,
    faceW,
    faceH,
    faceThickness,
  }
}

/**
 * A single board to be cut. `size` is the x/y/z box in mm (as used by the
 * 3D view); for the cutlist the board's material thickness is the smallest
 * dimension and the two larger ones are its face (length × width).
 */
export interface Board {
  id: string
  name: string
  qty: number
  size: [number, number, number]
  position: [number, number, number]
}

/** Board material thickness (mm) — always the smallest dimension. */
export function boardThickness(board: Board): number {
  return Math.min(...board.size)
}

/** [length, width] of the board face in mm, longest first. */
export function boardFace(board: Board): [number, number] {
  const dims = [...board.size].sort((a, b) => b - a)
  return [dims[0], dims[1]]
}

export interface Boards {
  box: Board[]
  grooves: Board[]
  rails: Board[]
  face: Board[]
}

/**
 * Builds every board of the drawer assembly (drawer box + face). The drawer
 * box follows standard drawer construction:
 *  - two full-depth sides,
 *  - a front and a back that butt-joint between the sides,
 *  - a bottom panel captured in dados routed across all four panels.
 */
export function computeBoards(config: DrawerConfig): Boards {
  const {
    openingH,
    openingD,
    slideThickness,
    boxThickness: T,
    bottomThickness: B,
  } = config
  const { drawerW, drawerH, boxDepth, faceW, faceH, faceThickness } =
    computeDims(config)

  // Drawer box, standard dado construction
  const side = (x: number): Board => ({
    id: x < 0 ? 'box-side-l' : 'box-side-r',
    name: 'Side',
    qty: 1,
    size: [T, drawerH, boxDepth],
    position: [x, 0, -boxDepth / 2],
  })
  const box: Board[] = [
    side(-(drawerW - T) / 2),
    side((drawerW - T) / 2),
    {
      id: 'box-front',
      name: 'Front',
      qty: 1,
      size: [drawerW - 2 * T, drawerH, T],
      position: [0, 0, -T / 2],
    },
    {
      id: 'box-back',
      name: 'Back',
      qty: 1,
      size: [drawerW - 2 * T, drawerH, T],
      position: [0, 0, -boxDepth + T / 2],
    },
    {
      id: 'box-bottom',
      name: 'Bottom',
      qty: 1,
      size: [drawerW - 2 * T, B, boxDepth - 2 * T],
      position: [0, -drawerH / 2 + DADO_INSET + B / 2, -boxDepth / 2],
    },
  ]

  // Dado grooves where the bottom panel seats (visual only, not cut)
  const grooveY = -drawerH / 2 + DADO_INSET + B / 2
  const grooves: Board[] = [
    {
      id: 'groove-side-l',
      name: 'Dado (side)',
      qty: 1,
      size: [DADO_VISIBLE, B + 1, boxDepth - 2 * T],
      position: [-(drawerW - 2 * T) / 2 - DADO_VISIBLE / 2, grooveY, -boxDepth / 2],
    },
    {
      id: 'groove-side-r',
      name: 'Dado (side)',
      qty: 1,
      size: [DADO_VISIBLE, B + 1, boxDepth - 2 * T],
      position: [(drawerW - 2 * T) / 2 + DADO_VISIBLE / 2, grooveY, -boxDepth / 2],
    },
    {
      id: 'groove-front',
      name: 'Dado (front)',
      qty: 1,
      size: [drawerW - 2 * T - 4, B + 1, DADO_VISIBLE],
      position: [0, grooveY, -T + DADO_VISIBLE / 2],
    },
    {
      id: 'groove-back',
      name: 'Dado (back)',
      qty: 1,
      size: [drawerW - 2 * T - 4, B + 1, DADO_VISIBLE],
      position: [0, grooveY, -boxDepth + T - DADO_VISIBLE / 2],
    },
  ]

  // Slide rails (hardware)
  const railLen = Math.max(1, openingD - BACK_CLEARANCE - 5)
  const railY = Math.min(
    -drawerH / 2 + B + slideThickness / 2,
    openingH / 2 - slideThickness / 2,
  )
  const rails: Board[] = [
    {
      id: 'rail-l',
      name: 'Slide rail',
      qty: 1,
      size: [slideThickness, slideThickness, railLen],
      position: [-(drawerW / 2 + slideThickness / 2), railY, -railLen / 2],
    },
    {
      id: 'rail-r',
      name: 'Slide rail',
      qty: 1,
      size: [slideThickness, slideThickness, railLen],
      position: [drawerW / 2 + slideThickness / 2, railY, -railLen / 2],
    },
  ]

  // Face attachment — fastened to the front of the box. Inset style: the
  // whole box group is shifted back by the face thickness so the face front
  // sits flush inside the carcass opening.
  const face: Board[] = [
    {
      id: 'face',
      name: 'Face',
      qty: 1,
      size: [faceW, faceH, faceThickness],
      position: [0, 0, faceThickness / 2],
    },
  ]

  return { box, grooves, rails, face }
}

/* ------------------------------------------------------------------ */
/* Cutlist                                                             */
/* ------------------------------------------------------------------ */

export interface CutlistRow {
  part: string
  length: number
  width: number
  thickness: number
  qty: number
}

export interface CutlistGroup {
  id: string
  label: string
  rows: CutlistRow[]
}

export interface Cutlist {
  groups: CutlistGroup[]
  /** Total number of boards to cut (respecting qty) */
  totalBoards: number
}

export function buildCutlist(config: DrawerConfig): Cutlist {
  const boards = computeBoards(config)

  const toRows = (list: Board[]): CutlistRow[] => {
    // Aggregate boards by size, pairing part names and summing quantities
    const bySize = new Map<
      string,
      { part: string; length: number; width: number; thickness: number; qty: number }
    >()
    for (const board of list) {
      const [length, width] = boardFace(board)
      const thickness = boardThickness(board)
      const key = `${length}|${width}|${thickness}`
      const existing = bySize.get(key)
      if (existing) {
        const names = new Set(existing.part.split(', '))
        names.add(board.name)
        existing.part = [...names].sort().join(', ')
        existing.qty += board.qty
      } else {
        bySize.set(key, {
          part: board.name,
          length,
          width,
          thickness,
          qty: board.qty,
        })
      }
    }
    return [...bySize.values()]
  }

  const groups: CutlistGroup[] = [
    { id: 'box', label: 'Drawer box', rows: toRows(boards.box) },
    { id: 'face', label: 'Face attachment', rows: toRows(boards.face) },
  ]

  const totalBoards = groups.reduce(
    (sum, group) => sum + group.rows.reduce((s, row) => s + row.qty, 0),
    0,
  )

  return { groups, totalBoards }
}

export function cutlistToText(
  config: DrawerConfig,
  unit: DisplayUnit = 'mm',
): string {
  const cutlist = buildCutlist(config)
  const lines: string[] = []
  lines.push(`Drawer cutlist (all dimensions in ${UNIT_LABEL[unit]})`)
  lines.push('Part — Length × Width × Thickness × Qty')
  lines.push('')
  for (const group of cutlist.groups) {
    lines.push(`${group.label}`)
    for (const row of group.rows) {
      lines.push(
        `  ${row.part}: ${formatMm(row.length, unit)} × ${formatMm(row.width, unit)} × ${formatMm(row.thickness, unit)} × ${row.qty}`,
      )
    }
  }
  lines.push('')
  lines.push(`Total: ${cutlist.totalBoards} boards`)
  lines.push(`Joinery: ${JOINERY_NOTE}`)
  lines.push('Hardware: 2 drawer slide rails (not cut from sheet material)')
  return lines.join('\n')
}
