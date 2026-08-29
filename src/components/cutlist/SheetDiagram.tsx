import { useMemo } from 'react'

import type { CutNode, Mosaic } from '@/lib/cutlist/optimizer'
import { formatMm } from '@/lib/units'
import type { DisplayUnit } from '@/lib/units'

const PALETTE = [
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#a855f7',
]

function colorFor(label: string): string {
  let h = 0
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

interface KerfLine {
  x1: number
  y1: number
  x2: number
  y2: number
}

function collectWaste(node: CutNode, out: { x: number; y: number; w: number; h: number }[]): void {
  if (node.kind === 'waste') out.push(node.rect)
  else if (node.kind === 'split') {
    collectWaste(node.a, out)
    collectWaste(node.b, out)
  }
}

function collectKerf(node: CutNode, out: KerfLine[]): void {
  if (node.kind !== 'split') return
  const { rect, dir, at } = node
  if (dir === 'v') {
    out.push({ x1: rect.x + at, y1: rect.y, x2: rect.x + at, y2: rect.y + rect.h })
  } else {
    out.push({ x1: rect.x, y1: rect.y + at, x2: rect.x + rect.w, y2: rect.y + at })
  }
  collectKerf(node.a, out)
  collectKerf(node.b, out)
}

const VIEW_W = 620
const MARGIN = 34

interface SheetDiagramProps {
  mosaic: Mosaic
  unit: DisplayUnit
}

/**
 * Scaled SVG of one stock-sheet layout. Parts are tinted by label, waste is
 * hatched, kerf lines are drawn in red, and the sheet's outer dimensions are
 * annotated along the edges. Each part shows its width along the top edge and
 * its height along the left edge (inset), with the label centered inside.
 */
export function SheetDiagram({ mosaic, unit }: SheetDiagramProps) {
  // All layouts inside a mosaic are identical; use the first copy.
  const layout = mosaic.layouts[0]
  const { w: sheetW, h: sheetH, root, parts } = layout

  // Scale the sheet to span the full viewBox width; the viewBox height
  // follows the sheet's aspect ratio, so the diagram fills the container
  // as much as possible regardless of the sheet proportions.
  const scale = (VIEW_W - MARGIN * 2) / sheetW
  const VIEW_H = sheetH * scale + MARGIN * 2
  const ox = (VIEW_W - sheetW * scale) / 2
  const oy = (VIEW_H - sheetH * scale) / 2
  const px = (v: number) => ox + v * scale
  const py = (v: number) => oy + v * scale

  const { wasteRects, kerfLines } = useMemo(() => {
    const wasteRects: { x: number; y: number; w: number; h: number }[] = []
    const kerfLines: KerfLine[] = []
    collectWaste(root, wasteRects)
    collectKerf(root, kerfLines)
    return { wasteRects, kerfLines }
  }, [root])

  const kerfPx = 1.2

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Cut layout for ${sheetW} × ${sheetH} sheet`}
    >
      <defs>
        <pattern
          id={`hatch-${mosaic.stock.id}`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.2" />
        </pattern>
      </defs>

      {/* Sheet */}
      <rect
        x={px(0)}
        y={py(0)}
        width={sheetW * scale}
        height={sheetH * scale}
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth={1.5}
      />

      {/* Waste regions */}
      {wasteRects.map((r, i) => (
        <g key={i}>
          <rect
            x={px(r.x)}
            y={py(r.y)}
            width={r.w * scale}
            height={r.h * scale}
            fill="var(--muted)"
            stroke="var(--border)"
            strokeWidth={0.6}
            strokeDasharray="3 2"
          />
          <rect
            x={px(r.x)}
            y={py(r.y)}
            width={r.w * scale}
            height={r.h * scale}
            fill={`url(#hatch-${mosaic.stock.id})`}
            className="text-muted-foreground/50"
          />
        </g>
      ))}

      {/* Kerf lines */}
      {kerfLines.map((k, i) => (
        <line
          key={`k${i}`}
          x1={px(k.x1)}
          y1={py(k.y1)}
          x2={px(k.x2)}
          y2={py(k.y2)}
          stroke="#ef4444"
          strokeWidth={kerfPx}
          opacity={0.85}
        />
      ))}

      {/* Parts */}
      {parts.map((p, i) => {
        const color = colorFor(p.item.spec.label)
        const pw = p.w * scale
        const ph = p.h * scale
        const cx = px(p.x) + pw / 2
        const cy = py(p.y) + ph / 2
        // The label sits centered inside the part; the width/height readouts
        // sit on the top and left edges, inset from the part outline.
        const showLabel = pw > 46 && ph > 30
        const showW = pw > 36 && ph > 46
        const showH = ph > 36 && pw > 48
        const inset = 9
        return (
          <g key={i}>
            <rect
              x={px(p.x)}
              y={py(p.y)}
              width={pw}
              height={ph}
              fill={color}
              fillOpacity={0.22}
              stroke={color}
              strokeWidth={1.4}
            />
            {showW && (
              <text
                x={cx}
                y={py(p.y) + inset}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted-foreground)"
              >
                {formatMm(p.w, unit)}
              </text>
            )}
            {showH && (
              <text
                x={px(p.x) + inset}
                y={cy}
                textAnchor="middle"
                fontSize={9}
                fill="var(--muted-foreground)"
                transform={`rotate(-90 ${px(p.x) + inset} ${cy})`}
              >
                {formatMm(p.h, unit)}
              </text>
            )}
            {showLabel && (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--foreground)"
              >
                {p.item.spec.label}
              </text>
            )}
          </g>
        )
      })}

      {/* Dimension annotations */}
      <text
        x={px(sheetW / 2)}
        y={py(0) - 10}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="var(--muted-foreground)"
      >
        {formatMm(sheetW, unit)} {unit}
      </text>
      <text
        x={px(0) - 12}
        y={py(sheetH / 2)}
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
        fill="var(--muted-foreground)"
        transform={`rotate(-90 ${px(0) - 12} ${py(sheetH / 2)})`}
      >
        {formatMm(sheetH, unit)} {unit}
      </text>
    </svg>
  )
}
