import { useMemo, type CSSProperties } from 'react'

import type { CutNode, Mosaic, PartItem, Rect } from '@/lib/cutlist/optimizer'
import type { DisplayUnit } from '@/lib/units'
import { formatMm } from '@/lib/units'

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

/** Separation padding (user units) pushed between panels split by completed cuts. */
const GAP = 24

const VIEW_W = 620
const MARGIN = 34

interface KerfLine {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Source panel region being cut by this kerf line. */
  rect: Rect
  /** Positional offset (user units) accumulated from completed ancestor cuts. */
  dx: number
  dy: number
}

interface SheetDiagramProps {
  mosaic: Mosaic
  unit: DisplayUnit
  /**
   * Index of the cut currently being inspected (into mosaic.cuts). null
   * shows the full plan with every kerf line drawn.
   */
  selectedCut?: number | null
  /** Draw each part's label centered inside its panel. */
  showLabels?: boolean
}

/**
 * Scaled SVG of one stock-sheet layout. Parts are tinted by label, waste is
 * hatched, kerf lines are drawn in red, and the sheet's outer dimensions are
 * annotated along the edges. Each part shows its width along the top edge and
 * its height along the left edge (inset), with the label centered inside
 * (labels can be hidden via the showLabels prop).
 * When a cut is selected, earlier cuts positionally push the cut-away panel
 * away from the rest (real padding between separated panels), the current
 * cut animates as a marking line from start to end, and later cuts stay as
 * faint planned lines.
 */
export function SheetDiagram({
  mosaic,
  unit,
  selectedCut = null,
  showLabels = true,
}: SheetDiagramProps) {
  // All layouts inside a mosaic are identical; use the first copy.
  const layout = mosaic.layouts[0]
  const { w: sheetW, h: sheetH, root } = layout

  // Scale the sheet to span the full viewBox width; the viewBox height
  // follows the sheet's aspect ratio, so the diagram fills the container
  // as much as possible regardless of the sheet proportions.
  const scale = (VIEW_W - MARGIN * 2) / sheetW
  const VIEW_H = sheetH * scale + MARGIN * 2
  const ox = (VIEW_W - sheetW * scale) / 2
  const oy = (VIEW_H - sheetH * scale) / 2
  const px = (v: number) => ox + v * scale
  const py = (v: number) => oy + v * scale

  const { parts, waste, kerfLines } = useMemo(() => {
    const parts: { item: PartItem; rect: Rect; dx: number; dy: number }[] = []
    const waste: { rect: Rect; dx: number; dy: number }[] = []
    const kerfLines: KerfLine[] = []

    // Pre-order index of every split node — matches mosaic.cuts order.
    const splitIndex = new Map<CutNode, number>()
    const indexSplits = (node: CutNode): void => {
      if (node.kind !== 'split') return
      splitIndex.set(node, splitIndex.size)
      indexSplits(node.a)
      indexSplits(node.b)
    }
    indexSplits(root)

    // Walk the cut tree, accumulating a positional offset per node. Each
    // completed cut pushes the child on the far side of the cut away by GAP,
    // so panels split so far are separated by real padding. Kerf lines are
    // recorded BEFORE descending (pre-order), matching cutsOfTree and
    // mosaic.cuts — so the highlighted line always matches the selected cut.
    const walk = (node: CutNode, dx: number, dy: number): void => {
      if (node.kind === 'split') {
        const { rect } = node
        if (node.dir === 'v') {
          kerfLines.push({
            x1: rect.x + node.at,
            y1: rect.y,
            x2: rect.x + node.at,
            y2: rect.y + rect.h,
            rect,
            dx,
            dy,
          })
        } else {
          kerfLines.push({
            x1: rect.x,
            y1: rect.y + node.at,
            x2: rect.x + rect.w,
            y2: rect.y + node.at,
            rect,
            dx,
            dy,
          })
        }
        const idx = splitIndex.get(node) ?? 0
        const done = selectedCut !== null && idx < selectedCut
        const far =
          node.dir === 'v'
            ? node.a.rect.x > node.b.rect.x
              ? node.a
              : node.b
            : node.a.rect.y > node.b.rect.y
              ? node.a
              : node.b
        const gdx = done && node.dir === 'v' ? GAP : 0
        const gdy = done && node.dir === 'h' ? GAP : 0
        walk(
          node.a,
          dx + (far === node.a ? gdx : 0),
          dy + (far === node.a ? gdy : 0),
        )
        walk(
          node.b,
          dx + (far === node.b ? gdx : 0),
          dy + (far === node.b ? gdy : 0),
        )
      } else if (node.kind === 'part') {
        parts.push({ item: node.item, rect: node.rect, dx, dy })
      } else {
        waste.push({ rect: node.rect, dx, dy })
      }
    }
    walk(root, 0, 0)

    return { parts, waste, kerfLines }
  }, [root, selectedCut])

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Cut layout for ${sheetW} × ${sheetH} sheet`}
    >
      <defs>
        <style>{`@keyframes cut-mark {
  from { stroke-dashoffset: var(--cut-len); }
  45% { stroke-dashoffset: 0; }
  to { stroke-dashoffset: 0; }
}`}</style>
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

      {/* Waste regions (shifted with their panel) */}
      {waste.map((w, i) => {
        const x = px(w.rect.x + w.dx)
        const y = py(w.rect.y + w.dy)
        const wd = w.rect.w * scale
        const ht = w.rect.h * scale
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={wd}
              height={ht}
              fill="var(--muted)"
              stroke="var(--border)"
              strokeWidth={0.6}
              strokeDasharray="3 2"
            />
            <rect
              x={x}
              y={y}
              width={wd}
              height={ht}
              fill={`url(#hatch-${mosaic.stock.id})`}
              className="text-muted-foreground/50"
            />
          </g>
        )
      })}



      {/* Kerf lines — the selected cut is animated as it is “marked”, later
          cuts stay as faint planned lines. Completed cuts draw nothing here:
          the two panels are positionally separated already. */}
      {kerfLines.map((k, i) => {
        const x1 = px(k.x1 + k.dx)
        const y1 = py(k.y1 + k.dy)
        const x2 = px(k.x2 + k.dx)
        const y2 = py(k.y2 + k.dy)
        const len = Math.hypot(x2 - x1, y2 - y1)
        const done = selectedCut !== null && i < selectedCut
        const current = selectedCut !== null && i === selectedCut
        if (done) return null
        if (current) {
          return (
            <g key={i}>
              {/* Source panel being cut by the current step */}
              <rect
                x={px(k.rect.x + k.dx)}
                y={py(k.rect.y + k.dy)}
                width={k.rect.w * scale}
                height={k.rect.h * scale}
                fill="#ef4444"
                fillOpacity={0.08}
                stroke="#ef4444"
                strokeWidth={1.8}
                strokeDasharray="6 4"
                rx={2}
              />
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#ef4444"
                strokeWidth={7}
                strokeLinecap="round"
                opacity={0.18}
              />
              <line
                key={`mark-${selectedCut}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#ef4444"
                strokeWidth={2.8}
                strokeLinecap="round"
                strokeDasharray={`${len} ${len}`}
                style={
                  {
                    '--cut-len': `${len}`,
                    strokeDashoffset: len,
                    // Draws from start to end, holds, then repeats.
                    animation: 'cut-mark 1.6s ease-out infinite',
                  } as CSSProperties
                }
              />
            </g>
          )
        }
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#ef4444"
            strokeWidth={1.2}
            opacity={selectedCut === null ? 0.85 : 0.3}
          />
        )
      })}

      {/* Parts (shifted with their panel) */}
      {parts.map((p, i) => {
        const color = colorFor(p.item.spec.label)
        const x = px(p.rect.x + p.dx)
        const y = py(p.rect.y + p.dy)
        const pw = p.rect.w * scale
        const ph = p.rect.h * scale
        const cx = x + pw / 2
        const cy = y + ph / 2
        // The label sits centered inside the part; the width/height readouts
        // always sit on the top and left edges, inset from the part outline.
        const showLabel = pw > 46 && ph > 30
        const inset = 8
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={pw}
              height={ph}
              fill={color}
              fillOpacity={0.22}
              stroke={color}
              strokeWidth={1.4}
            />
            <text
              x={cx}
              y={y + inset}
              textAnchor="middle"
              fontSize={8}
              fill="var(--muted-foreground)"
            >
              {formatMm(p.rect.w, unit)}
            </text>
            <text
              x={x + inset}
              y={cy}
              textAnchor="middle"
              fontSize={8}
              fill="var(--muted-foreground)"
              transform={`rotate(-90 ${x + inset} ${cy})`}
            >
              {formatMm(p.rect.h, unit)}
            </text>
            {showLabels && showLabel && (
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={10}
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
