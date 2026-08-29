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

interface CutSequenceTableProps {
  cuts: CutStep[]
  /** Global start number (cuts are numbered across all sheets). */
  startAt: number
  unit: DisplayUnit
}

/**
 * The physical cut sequence for one sheet: each row is one saw pass,
 * transforming a source panel into two result panels.
 */
export function CutSequenceTable({ cuts, startAt, unit }: CutSequenceTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Panel</TableHead>
          <TableHead className="text-right">Cut</TableHead>
          <TableHead>Result</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuts.map((cut, i) => (
          <TableRow key={i}>
            <TableCell className="text-muted-foreground tabular-nums">
              {startAt + i}
            </TableCell>
            <TableCell className="font-medium">{cut.source}</TableCell>
            <TableCell className="text-right font-mono text-xs tabular-nums">
              {formatMm(cut.length, unit)} {unit}
              <span className="block text-[10px] font-normal text-muted-foreground">
                at {formatMm(cut.position, unit)} {unit}
              </span>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5 font-mono text-xs tabular-nums">
                {cut.results.map((r, j) => (
                  <span key={j} className={j === 1 ? 'text-muted-foreground' : ''}>
                    {r.label}
                  </span>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
