import { useMemo, useState } from 'react'
import { Check, Copy, Table2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { JOINERY_NOTE, buildCutlist, cutlistToText } from '@/lib/drawer'
import { UNIT_LABEL, formatMm } from '@/lib/units'
import { useDrawerStore } from '@/store/useDrawerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

interface CutlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CutlistDialog({ open, onOpenChange }: CutlistDialogProps) {
  const drawers = useDrawerStore((state) => state.drawers)
  const displayUnit = useSettingsStore((state) => state.displayUnit)

  // Drawer inclusion set. New drawers are auto-included; deletions drop
  // their id (sync happens during render, no effect needed).
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(drawers.map((drawer) => drawer.id)),
  )
  const idsKey = drawers.map((drawer) => drawer.id).join(',')
  const [prevIdsKey, setPrevIdsKey] = useState(idsKey)
  if (idsKey !== prevIdsKey) {
    setPrevIdsKey(idsKey)
    setIncluded(new Set(drawers.map((drawer) => drawer.id)))
  }

  const [copied, setCopied] = useState(false)

  const includedDrawers = useMemo(
    () => drawers.filter((drawer) => included.has(drawer.id)),
    [drawers, included],
  )

  const totalBoards = useMemo(
    () =>
      includedDrawers.reduce(
        (sum, drawer) => sum + buildCutlist(drawer.config).totalBoards,
        0,
      ),
    [includedDrawers],
  )

  const copyText = useMemo(() => {
    const blocks = includedDrawers.map(
      (drawer) => `### ${drawer.name}\n${cutlistToText(drawer.config, displayUnit)}`,
    )
    return [
      ...blocks,
      '',
      `Total: ${totalBoards} boards across ${includedDrawers.length} drawer(s)`,
    ].join('\n\n')
  }, [includedDrawers, displayUnit, totalBoards])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — ignore
    }
  }

  const toggleAll = (on: boolean) =>
    setIncluded(new Set(on ? drawers.map((drawer) => drawer.id) : []))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="size-4" />
            Cutlist
          </DialogTitle>
          <DialogDescription>
            Pick the drawers to include. All dimensions in{' '}
            {UNIT_LABEL[displayUnit]}.
          </DialogDescription>
        </DialogHeader>

        {/* Drawer selection */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Drawers to include
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={() => toggleAll(true)}>
                All
              </Button>
              <Button variant="ghost" size="xs" onClick={() => toggleAll(false)}>
                None
              </Button>
            </div>
          </div>
          {drawers.map((drawer) => (
            <label
              key={drawer.id}
              className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
            >
              <Checkbox
                checked={included.has(drawer.id)}
                onCheckedChange={(checked) =>
                  setIncluded((prev) => {
                    const next = new Set(prev)
                    if (checked) next.add(drawer.id)
                    else next.delete(drawer.id)
                    return next
                  })
                }
              />
              <span className="flex-1 font-medium">{drawer.name}</span>
              <span className="text-xs text-muted-foreground">
                {formatMm(drawer.config.openingW, displayUnit)} ×{' '}
                {formatMm(drawer.config.openingH, displayUnit)} ×{' '}
                {formatMm(drawer.config.openingD, displayUnit)}{' '}
                {UNIT_LABEL[displayUnit]}
              </span>
            </label>
          ))}
        </div>

        {/* Per-drawer board tables */}
        {includedDrawers.map((drawer) => {
          const cutlist = buildCutlist(drawer.config)
          return (
            <div key={drawer.id} className="flex flex-col gap-2">
              <h3 className="border-b pb-1 text-sm font-semibold">
                {drawer.name}
              </h3>
              {cutlist.groups.map((group) => (
                <div key={group.id} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </span>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part(s)</TableHead>
                        <TableHead className="text-right">Length</TableHead>
                        <TableHead className="text-right">Width</TableHead>
                        <TableHead className="text-right">Thick</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={`${drawer.id}-${group.id}-${row.part}`}>
                          <TableCell className="font-medium">
                            {row.part}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMm(row.length, displayUnit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMm(row.width, displayUnit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatMm(row.thickness, displayUnit)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.qty}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )
        })}

        {includedDrawers.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No drawers selected — check at least one drawer to build the
            cutlist.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {totalBoards} boards total
          </span>{' '}
          across {includedDrawers.length} drawer(s). {JOINERY_NOTE} Slides are
          hardware (2 rails per drawer), not cut from sheet material.
        </p>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={includedDrawers.length === 0}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? 'Copied' : 'Copy cutlist'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
