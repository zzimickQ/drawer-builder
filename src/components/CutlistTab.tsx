import {
  ArrowLeftRight,
  Calculator,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ListPlus,
  Package,
  Plus,
  RefreshCw,
  RotateCw,
  Scissors,
  Settings2,
  Table2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { CutSequenceTable } from '@/components/cutlist/CutSequenceTable'
import { SheetDiagram } from '@/components/cutlist/SheetDiagram'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cutsToCsv, formatArea, planToText } from '@/lib/cutlist/format'
import { type Mosaic, type OptimizationResult } from '@/lib/cutlist/optimizer'
import {
  ensureStockForMaterials,
  partsFromDrawers,
  STOCK_PRESETS,
} from '@/lib/cutlist/stock'
import {
  CUT_DIRECTION_LABEL,
  PRIORITY_LABEL,
  type CutDirection,
  type OptimizationOptions,
  type OptimizationPriority,
  type PartSpec,
  type StockSpec,
} from '@/lib/cutlist/types'
import {
  formatMm,
  UNIT_LABEL,
  unitToMm,
  type DisplayUnit,
} from '@/lib/units'
import { cn } from '@/lib/utils'
import { useCutlistStore } from '@/store/useCutlistStore'
import { useDrawerStore } from '@/store/useDrawerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

const QUALITY_PRESETS: { label: string; budget: number }[] = [
  { label: 'Fast', budget: 800 },
  { label: 'Balanced', budget: 2500 },
  { label: 'Thorough', budget: 7000 },
]

/**
 * Input styling for fields inside the parts/stock tables: no boxed border or
 * rounding, so the table's own row/column borders provide the grid lines;
 * focus shows the same muted highlight as the row hover. Invalid drafts
 * still turn red via aria-invalid.
 */
const TABLE_CELL_INPUT =
  'h-7 min-w-0 rounded-none border-transparent bg-transparent px-1.5 text-xs md:text-xs focus-visible:border-transparent focus-visible:bg-muted/60 focus-visible:ring-0'

/**
 * Select trigger styled to match the table-cell inputs: no boxed border or
 * rounding, the chevron sits at the right edge where the input padding would
 * end, and focus shows the same muted highlight as the row hover.
 */
const TABLE_CELL_SELECT =
  'h-7 min-w-0 w-full rounded-none border-transparent bg-transparent pl-1.5 pr-1 text-xs md:text-xs focus-visible:border-transparent focus-visible:bg-muted/60 focus-visible:ring-0'

export function CutlistTab() {
  const drawers = useDrawerStore((state) => state.drawers)
  const displayUnit = useSettingsStore((state) => state.displayUnit)

  const parts = useCutlistStore((s) => s.parts)
  const stocks = useCutlistStore((s) => s.stocks)
  const options = useCutlistStore((s) => s.options)
  const result = useCutlistStore((s) => s.result)
  const calculated = useCutlistStore((s) => s.calculated)
  const showLabels = useCutlistStore((s) => s.showLabels)
  const showMaterials = useCutlistStore((s) => s.showMaterials)
  const showDiagramLabels = useCutlistStore((s) => s.showDiagramLabels)
  const setParts = useCutlistStore((s) => s.setParts)
  const setStocks = useCutlistStore((s) => s.setStocks)
  const patchOptions = useCutlistStore((s) => s.patchOptions)
  const setShowLabels = useCutlistStore((s) => s.setShowLabels)
  const setShowMaterials = useCutlistStore((s) => s.setShowMaterials)
  const setShowDiagramLabels = useCutlistStore((s) => s.setShowDiagramLabels)
  const [calculating, setCalculating] = useState(false)
  const [stale, setStale] = useState(false)
  const [copied, setCopied] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // First visit: import every drawer's boards automatically. On later visits
  // (persisted store) restore the last plan if one was calculated.
  const calculatedRef = useRef(calculated)
  useEffect(() => {
    calculatedRef.current = calculated
  }, [calculated])

  useEffect(() => {
    const t = window.setTimeout(() => {
      const s = useCutlistStore.getState()
      if (!s.initialized) {
        s.bootstrap()
      } else if (s.calculated && s.parts.length > 0 && s.stocks.length > 0 && !s.result) {
        s.calculate()
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [])

  // Live re-optimization once a plan exists (debounced). The first render
  // after a reload is handled by the restore above, so skip it here.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!calculatedRef.current || parts.length === 0 || stocks.length === 0) return
    const t = window.setTimeout(() => {
      setStale(true)
      setCalculating(true)
      useCutlistStore.getState().calculate()
      setStale(false)
      setCalculating(false)
    }, 500)
    return () => window.clearTimeout(t)
  }, [parts, stocks, options])

  const totalPieces = useMemo(
    () => parts.reduce((sum, p) => sum + Math.max(0, Math.round(p.qty || 0)), 0),
    [parts],
  )

  // Material choices come from the stock panels (deduped, in stock order).
  const stockMaterials = useMemo(
    () =>
      Array.from(
        new Set(
          stocks.map((s) => s.material).filter((m): m is string => Boolean(m)),
        ),
      ),
    [stocks],
  )

  // A part's material must always reference a stock material — never empty.
  // Any part with a missing/outdated material snaps to the first one in the
  // stock list (kept in sync as stock rows are added, edited or removed).
  useEffect(() => {
    if (stockMaterials.length === 0) return
    setParts((list) => {
      if (list.every((p) => p.material && stockMaterials.includes(p.material))) {
        return list
      }
      return list.map((p) =>
        p.material && stockMaterials.includes(p.material)
          ? p
          : { ...p, material: stockMaterials[0] },
      )
    })
  }, [stockMaterials, setParts])

  const runOptimize = () => {
    setCalculating(true)
    window.setTimeout(() => {
      useCutlistStore.getState().calculate()
      setStale(false)
      setCalculating(false)
    }, 30)
  }

  const handleCopy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(planToText(result, displayUnit))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable — ignore
    }
  }

  const handleCsv = () => {
    if (!result) return
    const blob = new Blob([cutsToCsv(result, displayUnit)], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cutlist-cuts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const updatePart = (id: string, patch: Partial<PartSpec>) =>
    setParts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const swapPart = (id: string) =>
    setParts((list) =>
      list.map((p) =>
        p.id === id ? { ...p, width: p.height, height: p.width } : p,
      ),
    )

  const addPart = () =>
    setParts((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        label: `Part ${list.length + 1}`,
        width: 500,
        height: 200,
        qty: 1,
        material: stockMaterials[0],
        canRotate: options.canRotate,
      },
    ])

  const updateStock = (id: string, patch: Partial<StockSpec>) =>
    setStocks((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const swapStock = (id: string) =>
    setStocks((list) =>
      list.map((s) =>
        s.id === id ? { ...s, width: s.height, height: s.width } : s,
      ),
    )

  const addStock = (preset?: (typeof STOCK_PRESETS)[number]) =>
    setStocks((list) => [
      ...list,
      {
        id: crypto.randomUUID(),
        label: preset?.label ?? `Stock ${list.length + 1}`,
        width: preset?.width ?? 2440,
        height: preset?.height ?? 1220,
        qty: 5,
        material: list[0]?.material,
      },
    ])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2">
            <Scissors className="size-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold tracking-tight">
              Cutlist optimizer
            </h1>
          </div>
          <span className="text-xs text-muted-foreground">
            {totalPieces} part{totalPieces === 1 ? '' : 's'} · {stocks.length}{' '}
            stock format{stocks.length === 1 ? '' : 's'}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              aria-label="Open settings"
              title="Settings"
            >
              <Settings2 className="size-4" />
            </Button>
            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={!result}
              title="Copy the full plan as text"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy plan'}
            </Button>
            <Button
              variant="outline"
              onClick={handleCsv}
              disabled={!result}
              title="Download the cut sequence as CSV"
            >
              <Download className="size-4" />
              CSV
            </Button>
            <Button
              onClick={runOptimize}
              disabled={calculating || parts.length === 0 || stocks.length === 0}
            >
              {calculating ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Calculator className="size-4" />
              )}
              {calculating
                ? 'Optimizing…'
                : result
                  ? 'Recalculate'
                  : 'Calculate'}
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
          {/* Inputs */}
          <div className="flex flex-col gap-5">
            <PartsCard
              parts={parts}
              drawers={drawers}
              unit={displayUnit}
              showLabels={showLabels}
              showMaterials={showMaterials}
              stockMaterials={stockMaterials}
              onUpdate={updatePart}
              onSwap={swapPart}
              onRemove={(id) => setParts((l) => l.filter((p) => p.id !== id))}
              onAdd={addPart}
              onImport={(ids, replace) => {
                const imported = partsFromDrawers(
                  drawers.filter((d) => ids.has(d.id)),
                )
                if (imported.length === 0) return
                if (replace) {
                  setParts(imported)
                } else {
                  setParts((list) => {
                    const existing = new Set(
                      list.map((p) => `${p.label}|${p.width}|${p.height}|${p.material}`),
                    )
                    const fresh = imported.filter(
                      (p) => !existing.has(`${p.label}|${p.width}|${p.height}|${p.material}`),
                    )
                    return [...list, ...fresh]
                  })
                }
                setStocks((current) => ensureStockForMaterials(current, imported))
              }}
            />

            <StockCard
              stocks={stocks}
              unit={displayUnit}
              showLabels={showLabels}
              showMaterials={showMaterials}
              onUpdate={updateStock}
              onSwap={swapStock}
              onRemove={(id) => setStocks((l) => l.filter((s) => s.id !== id))}
              onAdd={addStock}
            />

            <OptionsCard
              options={options}
              unit={displayUnit}
              showLabels={showLabels}
              showMaterials={showMaterials}
              showDiagramLabels={showDiagramLabels}
              onPatch={patchOptions}
              onQuality={(budget) => patchOptions({ timeBudgetMs: budget })}
              onShowLabelsChange={setShowLabels}
              onShowMaterialsChange={setShowMaterials}
              onShowDiagramLabelsChange={setShowDiagramLabels}
            />
          </div>

          {/* Results */}
          <div className="flex min-w-0 flex-col gap-5">
            {stale && result && (
              <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
                Inputs changed — the plan below is out of date. Recalculating
                automatically, or press Calculate.
              </p>
            )}
            {result ? (
              <Results
                result={result}
                unit={displayUnit}
                showDiagramLabels={showDiagramLabels}
              />
            ) : (
              <EmptyState
                hasParts={totalPieces > 0}
                hasStocks={stocks.length > 0}
                calculating={calculating}
              />
            )}
          </div>
        </div>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Numeric cell (draft input)                                          */
/* ------------------------------------------------------------------ */

/**
 * Text input for numeric values. Keeps a local draft so the user can type
 * anything (empty, zero, decimals, …) without the field snapping back;
 * the committed value only updates once the draft parses to a valid
 * number. Invalid drafts are flagged red via aria-invalid.
 */
function DraftNumberInput({
  value,
  unit,
  integer = false,
  onCommit,
  className,
  ariaLabel,
}: {
  /** Committed value — mm for dimensions, plain count for quantities. */
  value: number
  /** Display unit for dimensions; omit for plain counts. */
  unit?: DisplayUnit
  /** Require a positive integer (quantities) instead of any positive number. */
  integer?: boolean
  /** Called with the committed value (converted back to mm when unit is set). */
  onCommit: (v: number) => void
  className?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const text = draft ?? (unit ? formatMm(value, unit) : String(value))
  const parsed = parseFloat(text)
  const valid =
    Number.isFinite(parsed) &&
    parsed > 0 &&
    (!integer || Number.isInteger(parsed))

  return (
    <Input
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      aria-label={ariaLabel}
      aria-invalid={valid ? undefined : true}
      className={cn(
        TABLE_CELL_INPUT,
        'text-right tabular-nums',
        !valid && 'text-destructive',
        className,
      )}
      onChange={(e) => {
        const next = e.target.value
        setDraft(next)
        const v = parseFloat(next)
        if (
          Number.isFinite(v) &&
          v > 0 &&
          (!integer || Number.isInteger(v))
        ) {
          onCommit(unit ? unitToMm(v, unit) : v)
        }
      }}
      onBlur={() => setDraft(null)}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Parts table                                                         */
/* ------------------------------------------------------------------ */

function PartsCard({
  parts,
  drawers,
  unit,
  showLabels,
  showMaterials,
  stockMaterials,
  onUpdate,
  onSwap,
  onRemove,
  onAdd,
  onImport,
}: {
  parts: PartSpec[]
  drawers: { id: string; name: string }[]
  unit: 'mm' | 'cm' | 'in'
  showLabels: boolean
  showMaterials: boolean
  stockMaterials: string[]
  onUpdate: (id: string, patch: Partial<PartSpec>) => void
  onSwap: (id: string) => void
  onRemove: (id: string) => void
  onAdd: () => void
  onImport: (ids: Set<string>, replace: boolean) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Table2 className="size-4 text-muted-foreground" />
            Parts to cut
            <span className="text-xs font-normal text-muted-foreground">
              ({parts.length})
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <ImportPopover drawers={drawers} onImport={onImport} />
            <Button variant="outline" size="icon-sm" onClick={onAdd} title="Add part">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {parts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No parts yet — import from your drawers or add rows manually.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {showLabels && (
                    <TableHead className="w-[24%]">Label</TableHead>
                  )}
                  <TableHead className="w-[12%] text-right">Width</TableHead>
                  <TableHead className="w-9 text-center" title="Swap width and height">
                    <ArrowLeftRight className="mx-auto size-3.5" aria-hidden />
                    <span className="sr-only">Swap width and height</span>
                  </TableHead>
                  <TableHead className="w-[12%] text-right">Height</TableHead>
                  <TableHead className="w-[9%] text-right">Qty</TableHead>
                  {showMaterials && (
                    <TableHead className="w-[16%]">Material</TableHead>
                  )}
                  <TableHead
                    className="w-9 text-center"
                    title="Allow 90° rotation"
                  >
                    <RotateCw className="mx-auto size-3.5" aria-hidden />
                    <span className="sr-only">Allow rotation</span>
                  </TableHead>
                  <TableHead className="w-9" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => (
                  <TableRow key={part.id}>
                    {showLabels && (
                      <TableCell className="py-1 pr-1">
                        <Input
                          value={part.label}
                          onChange={(e) => onUpdate(part.id, { label: e.target.value })}
                          className={TABLE_CELL_INPUT}
                          aria-label="Part label"
                        />
                      </TableCell>
                    )}
                    <TableCell className="py-1 pr-1">
                      <DraftNumberInput
                        unit={unit}
                        value={part.width}
                        onCommit={(v) => onUpdate(part.id, { width: v })}
                        ariaLabel="Part width"
                      />
                    </TableCell>
                    <TableCell className="py-1 text-center">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onSwap(part.id)}
                        aria-label={`Swap width and height of ${part.label}`}
                        title="Swap width and height"
                      >
                        <ArrowLeftRight className="size-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell className="py-1 pr-1">
                      <DraftNumberInput
                        unit={unit}
                        value={part.height}
                        onCommit={(v) => onUpdate(part.id, { height: v })}
                        ariaLabel="Part height"
                      />
                    </TableCell>
                    <TableCell className="py-1 pr-1">
                      <DraftNumberInput
                        integer
                        value={part.qty}
                        onCommit={(v) => onUpdate(part.id, { qty: v })}
                        ariaLabel="Part quantity"
                      />
                    </TableCell>
                    {showMaterials && (
                      <TableCell className="py-1 pr-1">
                        <Select
                          value={part.material ?? ''}
                          onValueChange={(v) =>
                            onUpdate(part.id, { material: v || undefined })
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className={TABLE_CELL_SELECT}
                            disabled={stockMaterials.length === 0}
                            aria-label="Part material"
                          >
                            <SelectValue placeholder="No materials" />
                          </SelectTrigger>
                          <SelectContent align="start">
                            {stockMaterials.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell className="py-1 text-center">
                      <Checkbox
                        checked={part.canRotate}
                        onCheckedChange={(checked) =>
                          onUpdate(part.id, { canRotate: checked === true })
                        }
                        aria-label="Allow rotation"
                        title="Allow 90° rotation"
                      />
                    </TableCell>
                    <TableCell className="py-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemove(part.id)}
                        aria-label={`Remove ${part.label}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {['Width', 'height', 'qty', ...(showMaterials ? ['material'] : [])].join(' × ')} · the ⇄ button swaps width and height; the checkbox allows 90° rotation during nesting.
              {showMaterials && ' Material choices come from the stock panels.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ImportPopover({
  drawers,
  onImport,
}: {
  drawers: { id: string; name: string }[]
  onImport: (ids: Set<string>, replace: boolean) => void
}) {
  const [sel, setSel] = useState<Set<string>>(
    () => new Set(drawers.map((d) => d.id)),
  )
  const [open, setOpen] = useState(false)

  const toggle = (id: string, checked: boolean) =>
    setSel((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="icon-sm" title="Import from drawers" />
        }
      >
        <ListPlus className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" side="bottom" className="w-72">
        <p className="text-sm font-medium">Import from drawers</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Adds each drawer's boards as parts (grouped by size, material = board
          thickness).
        </p>
        <div className="mt-2 flex max-h-52 flex-col gap-1 overflow-y-auto">
          {drawers.length === 0 && (
            <p className="text-xs text-muted-foreground">No drawers yet.</p>
          )}
          {drawers.map((drawer) => (
            <label
              key={drawer.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={sel.has(drawer.id)}
                onCheckedChange={(checked) => toggle(drawer.id, checked === true)}
              />
              <span className="truncate">{drawer.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={sel.size === 0}
            onClick={() => {
              onImport(sel, false)
              setOpen(false)
            }}
          >
            Append
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={sel.size === 0}
            onClick={() => {
              onImport(sel, true)
              setOpen(false)
            }}
          >
            Replace list
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/* Stock table                                                         */
/* ------------------------------------------------------------------ */

function StockCard({
  stocks,
  unit,
  showLabels,
  showMaterials,
  onUpdate,
  onSwap,
  onRemove,
  onAdd,
}: {
  stocks: StockSpec[]
  unit: 'mm' | 'cm' | 'in'
  showLabels: boolean
  showMaterials: boolean
  onUpdate: (id: string, patch: Partial<StockSpec>) => void
  onSwap: (id: string) => void
  onRemove: (id: string) => void
  onAdd: (preset?: (typeof STOCK_PRESETS)[number]) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Package className="size-4 text-muted-foreground" />
            Stock panels
            <span className="text-xs font-normal text-muted-foreground">
              ({stocks.length})
            </span>
          </CardTitle>
          <Button variant="outline" size="icon-sm" onClick={() => onAdd()} title="Add stock format">
            <Plus className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {STOCK_PRESETS.slice(0, 6).map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onAdd(preset)}
              className="rounded-md border px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              + {preset.label}
            </button>
          ))}
        </div>
        {stocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No stock panels — add a sheet format to optimize against.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {showLabels && (
                  <TableHead className="w-[28%]">Label</TableHead>
                )}
                <TableHead className="w-[13%] text-right">Width</TableHead>
                <TableHead className="w-9 text-center" title="Swap width and height">
                  <ArrowLeftRight className="mx-auto size-3.5" aria-hidden />
                  <span className="sr-only">Swap width and height</span>
                </TableHead>
                <TableHead className="w-[13%] text-right">Height</TableHead>
                <TableHead className="w-[11%] text-right">Qty</TableHead>
                {showMaterials && (
                  <TableHead className="w-[18%]">Material</TableHead>
                )}
                <TableHead className="w-9" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => (
                <TableRow key={stock.id}>
                  {showLabels && (
                    <TableCell className="py-1 pr-1">
                      <Input
                        value={stock.label}
                        onChange={(e) => onUpdate(stock.id, { label: e.target.value })}
                        className={TABLE_CELL_INPUT}
                        aria-label="Stock label"
                      />
                    </TableCell>
                  )}
                  <TableCell className="py-1 pr-1">
                    <DraftNumberInput
                      unit={unit}
                      value={stock.width}
                      onCommit={(v) => onUpdate(stock.id, { width: v })}
                      ariaLabel="Stock width"
                    />
                  </TableCell>
                  <TableCell className="py-1 text-center">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onSwap(stock.id)}
                      aria-label={`Swap width and height of ${stock.label}`}
                      title="Swap width and height"
                    >
                      <ArrowLeftRight className="size-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell className="py-1 pr-1">
                    <DraftNumberInput
                      unit={unit}
                      value={stock.height}
                      onCommit={(v) => onUpdate(stock.id, { height: v })}
                      ariaLabel="Stock height"
                    />
                  </TableCell>
                  <TableCell className="py-1 pr-1">
                    <DraftNumberInput
                      integer
                      value={stock.qty}
                      onCommit={(v) => onUpdate(stock.id, { qty: v })}
                      ariaLabel="Stock quantity"
                    />
                  </TableCell>
                  {showMaterials && (
                    <TableCell className="py-1 pr-1">
                      <Input
                        value={stock.material ?? ''}
                        onChange={(e) => onUpdate(stock.id, { material: e.target.value || undefined })}
                        className={TABLE_CELL_INPUT}
                        placeholder="Material"
                        aria-label="Stock material"
                      />
                    </TableCell>
                  )}
                  <TableCell className="py-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemove(stock.id)}
                      aria-label={`Remove ${stock.label}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

function OptionsCard({
  options,
  unit,
  showLabels,
  showMaterials,
  showDiagramLabels,
  onPatch,
  onQuality,
  onShowLabelsChange,
  onShowMaterialsChange,
  onShowDiagramLabelsChange,
}: {
  options: OptimizationOptions
  unit: DisplayUnit
  showLabels: boolean
  showMaterials: boolean
  showDiagramLabels: boolean
  onPatch: (patch: Partial<OptimizationOptions>) => void
  onQuality: (budget: number) => void
  onShowLabelsChange: (show: boolean) => void
  onShowMaterialsChange: (show: boolean) => void
  onShowDiagramLabelsChange: (show: boolean) => void
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Scissors className="size-4 text-muted-foreground" />
          Options
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Input */}
          <div className="flex min-w-0 flex-col gap-3">
            <ColumnHeader>Input</ColumnHeader>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-muted-foreground">
                Kerf (saw cut)
              </label>
              <div className="relative w-24">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={unit === 'in' ? 0.02 : unit === 'cm' ? 0.05 : 0.5}
                  value={formatMm(options.kerf, unit)}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (!Number.isNaN(v) && v >= 0) onPatch({ kerf: unitToMm(v, unit) })
                  }}
                  className="h-7 pr-8 text-right text-xs tabular-nums"
                  aria-label="Kerf"
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground">
                  {UNIT_LABEL[unit]}
                </span>
              </div>
            </div>

            <OptionRow
              label="Allow rotation"
              hint="Permit 90° rotation of panels (grain direction is respected when off)"
            >
              <Checkbox
                checked={options.canRotate}
                onCheckedChange={(c) => onPatch({ canRotate: c === true })}
                aria-label="Allow rotation"
              />
            </OptionRow>

            <OptionRow
              label="Consider material"
              hint="Never cut parts from a different material's stock"
            >
              <Checkbox
                checked={options.considerMaterials}
                onCheckedChange={(c) => onPatch({ considerMaterials: c === true })}
                aria-label="Consider material"
              />
            </OptionRow>

            <OptionRow
              label="Use only one sheet"
              hint="Maximize parts on a single sheet; leftovers are reported unplaced"
            >
              <Checkbox
                checked={options.forceOneSheet}
                onCheckedChange={(c) => onPatch({ forceOneSheet: c === true })}
                aria-label="Use only one sheet"
              />
            </OptionRow>

            <Separator />

            <div className="flex flex-col gap-3">
              <SelectField
                label="Optimization priority"
                value={options.priority}
                onValueChange={(v) => onPatch({ priority: v as OptimizationPriority })}
                options={(
                  Object.keys(PRIORITY_LABEL) as OptimizationPriority[]
                ).map((key) => ({ value: key, label: PRIORITY_LABEL[key] }))}
              />
              <SelectField
                label="Preferred cut direction"
                value={options.preferredCutDirection}
                onValueChange={(v) =>
                  onPatch({ preferredCutDirection: v as CutDirection })
                }
                options={(
                  Object.keys(CUT_DIRECTION_LABEL) as CutDirection[]
                ).map((key) => ({ value: key, label: CUT_DIRECTION_LABEL[key] }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">
                Search effort{' '}
                <span className="text-[10px]">({(options.timeBudgetMs / 1000).toFixed(1)} s)</span>
              </span>
              <div className="flex rounded-lg border p-0.5">
                {QUALITY_PRESETS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => onQuality(q.budget)}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                      options.timeBudgetMs === q.budget
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Diagram */}
          <div className="flex min-w-0 flex-col gap-3">
            <ColumnHeader>Diagram</ColumnHeader>

            <OptionRow
              label="Show labels on diagram"
              hint="Draw each part's label inside the layout diagram"
            >
              <Checkbox
                checked={showDiagramLabels}
                onCheckedChange={(c) => onShowDiagramLabelsChange(c === true)}
                aria-label="Show labels on diagram"
              />
            </OptionRow>

            <Separator />

            <OptionRow
              label="Show labels in tables"
              hint="Show the label column in the parts and stock tables"
            >
              <Checkbox
                checked={showLabels}
                onCheckedChange={(c) => onShowLabelsChange(c === true)}
                aria-label="Show labels in tables"
              />
            </OptionRow>

            <OptionRow
              label="Show materials in tables"
              hint="Show the material column in the parts and stock tables"
            >
              <Checkbox
                checked={showMaterials}
                onCheckedChange={(c) => onShowMaterialsChange(c === true)}
                aria-label="Show materials in tables"
              />
            </OptionRow>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h4>
  )
}

function OptionRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={(v) => onValueChange(v ?? '')}>
        <SelectTrigger className="w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

/**
 * One sheet's result card: the layout diagram with step-through cut
 * inspection (prev/next arrows, animated marking line) plus the clickable
 * cut sequence table.
 */
function SheetCutCard({
  mosaic,
  unit,
  index,
  showDiagramLabels,
}: {
  mosaic: Mosaic
  unit: DisplayUnit
  index: number
  showDiagramLabels: boolean
}) {
  const cuts = mosaic.cuts
  const startAt = cuts[0]?.n ?? 1
  const [selected, setSelected] = useState<number | null>(null)

  // Clamp in case the plan was recalculated with fewer cuts.
  const current =
    cuts.length === 0
      ? null
      : selected !== null
        ? Math.min(selected, cuts.length - 1)
        : null
  const cut = current !== null ? cuts[current] : null

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-sm">
            Sheet {index + 1} — {mosaic.stock.label} {formatMm(mosaic.w, unit)} ×{' '}
            {formatMm(mosaic.h, unit)} {unit}
          </CardTitle>
          {mosaic.qty > 1 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              × {mosaic.qty} identical
            </span>
          )}
          {mosaic.stock.material && (
            <span className="text-[11px] text-muted-foreground">
              {mosaic.stock.material}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Used <b className="text-foreground tabular-nums">{formatArea(mosaic.stats.usedArea, unit)}</b>
            </span>
            <span>
              Wasted{' '}
              <b className="text-foreground tabular-nums">
                {formatArea(mosaic.stats.wastedArea, unit)} ({mosaic.stats.wastePct.toFixed(1)} %)
              </b>
            </span>
            <span>
              Cuts{' '}
              <b className="text-foreground tabular-nums">{mosaic.stats.cutCount}</b>
            </span>
            <span>
              Cut length{' '}
              <b className="text-foreground tabular-nums">
                {formatMm(mosaic.stats.cutLength, unit)} {unit}
              </b>
            </span>
            <span>
              Panels{' '}
              <b className="text-foreground tabular-nums">{mosaic.stats.panels}</b>
            </span>
            <span>
              Waste panels{' '}
              <b className="text-foreground tabular-nums">{mosaic.stats.wastePanels}</b>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex justify-center rounded-lg border bg-muted/20 p-2">
          <SheetDiagram
            mosaic={mosaic}
            unit={unit}
            selectedCut={current}
            showLabels={showDiagramLabels}
          />
        </div>

        {cuts.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-lg border bg-muted/20 px-3 py-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setSelected((s) => (s === null ? 0 : Math.max(s - 1, 0)))
              }
              disabled={current === null || current === 0}
              aria-label="Previous cut"
              title="Previous cut"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1 text-center text-xs leading-relaxed">
              {current !== null && cut ? (
                <span>
                  <span className="text-muted-foreground">
                    Cut {startAt + current} ·{' '}
                  </span>
                  <b className="tabular-nums">
                    Measure {formatMm(cut.position, unit)} {unit} from the{' '}
                    {cut.dir === 'v' ? 'left' : 'top'}
                  </b>
                  {' · '}
                  <b className="text-primary capitalize tabular-nums">
                    cut across the{' '}
                    {cut.length >= Math.max(cut.sourceW, cut.sourceH)
                      ? 'long'
                      : 'short'}{' '}
                    side ({formatMm(cut.length, unit)} {unit})
                  </b>
                  <span className="text-muted-foreground">
                    {' · '}
                    {cut.source} → {cut.results.map((r) => r.label).join(' | ')}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Press → to step through the cut sequence
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                setSelected((s) =>
                  s === null ? 0 : Math.min(s + 1, cuts.length - 1),
                )
              }
              disabled={current !== null && current === cuts.length - 1}
              aria-label="Next cut"
              title="Next cut"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}

        {cuts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Cut sequence
            </h4>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              <CutSequenceTable
                cuts={cuts}
                startAt={startAt}
                unit={unit}
                selectedIndex={current}
                onSelect={setSelected}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Results({
  result,
  unit,
  showDiagramLabels,
}: {
  result: OptimizationResult
  unit: 'mm' | 'cm' | 'in'
  showDiagramLabels: boolean
}) {
  const stats: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'Sheets used', value: String(result.sheetsUsed), highlight: true },
    { label: 'Stock area', value: formatArea(result.stockArea, unit) },
    { label: 'Used area', value: formatArea(result.usedArea, unit) },
    { label: 'Wasted area', value: formatArea(result.wastedArea, unit) },
    {
      label: 'Waste',
      value: `${result.wastePct.toFixed(1)} %`,
      highlight: result.wastePct < 30,
    },
    { label: 'Cuts', value: String(result.cutCount) },
    {
      label: 'Cut length',
      value: `${formatMm(result.cutLength, unit)} ${unit}`,
    },
    { label: 'Panels', value: String(result.panels) },
    { label: 'Waste panels', value: String(result.wastePanels) },
    { label: 'Layouts', value: String(result.mosaics.length) },
  ]

  return (
    <>
      {/* Statistics */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm">Statistics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-0.5 rounded-lg border bg-muted/30 px-2.5 py-2"
              >
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  {s.label}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    s.highlight && 'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {s.value}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Kerf {formatMm(result.options.kerf, unit)} {UNIT_LABEL[unit]} ·{' '}
            {PRIORITY_LABEL[result.options.priority]} · waste includes kerf dust
            · optimized in {(result.elapsedMs / 1000).toFixed(1)} s
          </p>
        </CardContent>
      </Card>

      {/* Per-sheet layouts */}
      {result.mosaics.map((mosaic, i) => (
        <SheetCutCard
          key={`${mosaic.stock.id}-${i}`}
          mosaic={mosaic}
          unit={unit}
          index={i}
          showDiagramLabels={showDiagramLabels}
        />
      ))}

      {/* Unable to fit */}
      {result.unableToFit.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" />
              Unable to fit
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {result.unableToFit.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-md border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-sm"
              >
                <span className="font-medium">{p.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatMm(p.w, unit)} × {formatMm(p.h, unit)} {UNIT_LABEL[unit]}
                  {p.material ? ` · ${p.material}` : ''}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}

function EmptyState({
  hasParts,
  hasStocks,
  calculating,
}: {
  hasParts: boolean
  hasStocks: boolean
  calculating: boolean
}) {
  return (
    <Card className="flex min-h-72 items-center justify-center">
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Scissors className="size-8 text-muted-foreground/50" />
        {calculating ? (
          <p className="text-sm font-medium">Optimizing…</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {!hasParts
                ? 'Add parts to optimize'
                : !hasStocks
                  ? 'Add at least one stock panel'
                  : 'Ready to optimize'}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {!hasParts
                ? 'Import boards from your drawers with the + button, or add parts manually, then press Calculate.'
                : 'Press Calculate to nest the parts onto stock sheets — the plan shows layouts, cut sequences and waste statistics.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
