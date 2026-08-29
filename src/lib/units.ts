export type DisplayUnit = 'mm' | 'cm' | 'in'

/** mm per display unit */
export const UNIT_SCALE: Record<DisplayUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
}

export const UNIT_LABEL: Record<DisplayUnit, string> = {
  mm: 'mm',
  cm: 'cm',
  in: 'in',
}

/** Decimal places used when formatting a value in the unit */
export const UNIT_DECIMALS: Record<DisplayUnit, number> = {
  mm: 0,
  cm: 1,
  in: 2,
}

export function mmToUnit(mm: number, unit: DisplayUnit): number {
  return mm / UNIT_SCALE[unit]
}

export function unitToMm(value: number, unit: DisplayUnit): number {
  return value * UNIT_SCALE[unit]
}

/** Formats an mm value for display in the given unit. */
export function formatMm(mm: number, unit: DisplayUnit): string {
  return mmToUnit(mm, unit).toFixed(UNIT_DECIMALS[unit])
}
