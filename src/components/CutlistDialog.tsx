import { useMemo, useState } from 'react'
import { Check, Copy, Table2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import {
  JOINERY_NOTE,
  buildCutlist,
  cutlistToText,
} from '@/lib/drawer'
import { useDrawerStore } from '@/store/useDrawerStore'

interface CutlistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CutlistDialog({ open, onOpenChange }: CutlistDialogProps) {
  const config = useDrawerStore((state) => state.config)
  const cutlist = useMemo(() => buildCutlist(config), [config])
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cutlistToText(config))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="size-4" />
            Cutlist
          </DialogTitle>
          <DialogDescription>
            All dimensions in mm. Length × Width × Thickness × Qty.
          </DialogDescription>
        </DialogHeader>

        {cutlist.groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {group.label}
            </h3>
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
                  <TableRow key={`${group.id}-${row.part}`}>
                    <TableCell className="font-medium">{row.part}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(row.length)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(row.width)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Math.round(row.thickness)}
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

        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {cutlist.totalBoards} boards total.
          </span>{' '}
          {JOINERY_NOTE} Slides are hardware (2 rails), not cut from sheet
          material.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy cutlist'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
