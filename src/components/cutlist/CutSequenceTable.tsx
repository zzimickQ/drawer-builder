import { useEffect, useRef } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { CutStep } from '@/lib/cutlist/optimizer'
import { formatMm } from '@/lib/units'
import type { DisplayUnit } from '@/lib/units'
import { cn } from '@/lib/utils'

interface CutSequenceTableProps {
  cuts: CutStep[]
  /** Global start number (cuts are numbered across all sheets). */
  startAt: number
  unit: DisplayUnit
  /** Index of the currently inspected cut, or null. */
  selectedIndex?: number | null
  /** Called when a row is clicked (select a cut). */
  onSelect?: (index: number) => void
}

/**
 * The physical cut sequence for one sheet: each row is one saw pass,
 * transforming a source panel into two result panels. Rows are clickable to
 * inspect the cut on the sheet diagram.
 */
export function CutSequenceTable({
  cuts,
  startAt,
  unit,
  selectedIndex = null,
  onSelect,
}: CutSequenceTableProps) {
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])

  // Keep the currently inspected cut in view when stepping with the arrows.
  useEffect(() => {
    if (selectedIndex === null) return
    rowRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedIndex])

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Measure</TableHead>
          <TableHead>Cut across</TableHead>
          <TableHead>Source → Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuts.map((cut, i) => {
          const long = Math.max(cut.sourceW, cut.sourceH)
          const side = cut.length >= long ? 'long' : 'short'
          return (
            <TableRow
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              onClick={onSelect ? () => onSelect(i) : undefined}
              className={cn(
                onSelect && 'cursor-pointer',
                selectedIndex === i && 'bg-primary/10 hover:bg-primary/10',
              )}
            >
              <TableCell className="text-muted-foreground tabular-nums">
                {startAt + i}
              </TableCell>
              <TableCell>
                <div className="text-xs">
                  <span className="font-semibold tabular-nums">
                    {formatMm(cut.position, unit)} {unit}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    from {cut.dir === 'v' ? 'left' : 'top'}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-xs">
                  <span className="font-semibold text-primary capitalize tabular-nums">
                    {side} side
                  </span>
                  <span className="block text-[10px] text-muted-foreground tabular-nums">
                    {formatMm(cut.length, unit)} {unit} across
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-xs">
                  <span className="font-medium">{cut.source}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {cut.results.map((r) => r.label).join(' | ')}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
