import type { OptimizationResult } from '@/lib/cutlist/optimizer'
import {
  CUT_DIRECTION_LABEL,
  PRIORITY_LABEL,
  type OptimizationOptions,
} from '@/lib/cutlist/types'
import { UNIT_LABEL, formatMm, type DisplayUnit } from '@/lib/units'

/** Formats an area (mm²) in the display unit. */
export function formatArea(mm2: number, unit: DisplayUnit): string {
  if (unit === 'cm') {
    return `${(mm2 / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} cm²`
  }
  if (unit === 'in') {
    return `${(mm2 / 645.16).toLocaleString(undefined, { maximumFractionDigits: 1 })} in²`
  }
  return `${mm2.toLocaleString(undefined, { maximumFractionDigits: 0 })} mm²`
}

function optionsLine(options: OptimizationOptions, unit: DisplayUnit): string[] {
  return [
    `Cut thickness (kerf): ${formatMm(options.kerf, unit)} ${UNIT_LABEL[unit]}`,
    `Optimization priority: ${PRIORITY_LABEL[options.priority]}`,
    `Preferred cut direction: ${CUT_DIRECTION_LABEL[options.preferredCutDirection]}`,
    `Rotation allowed: ${options.canRotate ? 'yes' : 'no'}`,
    `Consider materials: ${options.considerMaterials ? 'yes' : 'no'}`,
    `Use only one sheet: ${options.forceOneSheet ? 'yes' : 'no'}`,
  ]
}

/** Plain-text export of the whole optimization plan. */
export function planToText(result: OptimizationResult, unit: DisplayUnit): string {
  const lines: string[] = []
  lines.push('Cutlist optimizer — plan')
  lines.push('')
  lines.push('Settings')
  lines.push(...optionsLine(result.options, unit))
  lines.push('')
  lines.push('Statistics')
  lines.push(
    `  Stock used: ${result.sheetsUsed} sheet(s) — ${formatArea(result.stockArea, unit)}`,
  )
  lines.push(`  Used area: ${formatArea(result.usedArea, unit)}`)
  lines.push(`  Wasted area: ${formatArea(result.wastedArea, unit)} (${result.wastePct.toFixed(1)} %)`)
  lines.push(`  Cuts: ${result.cutCount} — total length ${formatMm(result.cutLength, unit)} ${unit}`)
  lines.push(`  Panels: ${result.panels} — waste panels: ${result.wastePanels}`)
  lines.push(`  Distinct layouts (mosaics): ${result.mosaics.length}`)
  lines.push('')

  for (const m of result.mosaics) {
    lines.push(`Sheet — ${m.stock.label} ${m.w} × ${m.h} × ${m.qty}`)
    lines.push(
      `  Used ${formatArea(m.stats.usedArea, unit)} · Wasted ${formatArea(m.stats.wastedArea, unit)} (${m.stats.wastePct.toFixed(1)} %) · ${m.stats.cutCount} cuts (${formatMm(m.stats.cutLength, unit)} ${unit}) · ${m.stats.panels} panels · ${m.stats.wastePanels} waste panels`,
    )
    lines.push('  Cuts:')
    for (const c of m.cuts) {
      lines.push(
        `    ${c.n}. ${c.source} → ${formatMm(c.length, unit)} ${unit} at ${formatMm(c.position, unit)} ${unit} → ${c.results.map((r) => r.label).join(' | ')}`,
      )
    }
    lines.push('')
  }

  if (result.unableToFit.length > 0) {
    lines.push('Unable to fit')
    for (const p of result.unableToFit) {
      lines.push(`  ${p.label}: ${p.w} × ${p.h} (${p.material ?? 'no material'})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/** CSV export of the cut sequence (one row per saw pass). */
export function cutsToCsv(result: OptimizationResult, unit: DisplayUnit): string {
  const header = ['Sheet', 'Cut #', 'Source panel', `Cut length (${unit})`, `Position (${unit})`, 'Result 1', 'Result 2']
  const rows = result.mosaics.flatMap((m) =>
    m.cuts.map((c) => [
      `${m.stock.label} (${m.w}×${m.h})${m.qty > 1 ? ` ×${m.qty}` : ''}`,
      String(c.n),
      c.source,
      formatMm(c.length, unit),
      formatMm(c.position, unit),
      c.results[0]?.label ?? '',
      c.results[1]?.label ?? '',
    ]),
  )
  const escape = (v: string) => `"${v.replaceAll('"', '""')}"`
  return [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
}
