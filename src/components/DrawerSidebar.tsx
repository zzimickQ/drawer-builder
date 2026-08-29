import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  PanelRightClose,
  RotateCcw,
} from 'lucide-react'

import { CutlistDialog } from '@/components/CutlistDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { DEFAULT_CONFIG, clamp, type DrawerConfig } from '@/lib/drawer'
import { useDrawerStore } from '@/store/useDrawerStore'

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState(value)

  // Adjust state during render when the value changes externally (e.g. reset)
  if (prevValue !== value) {
    setPrevValue(value)
    setDraft(null)
  }

  const display = draft ?? String(value)

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={display}
          onChange={(event) => {
            setDraft(event.target.value)
            const parsed = parseFloat(event.target.value)
            if (!Number.isNaN(parsed)) {
              onChange(clamp(parsed, min, max))
            }
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
          mm
        </span>
      </div>
    </div>
  )
}

function SliderField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-sm font-medium tabular-nums">
          {Math.round(value)}%
        </span>
      </div>
      <Slider
        min={0}
        max={100}
        step={1}
        value={value}
        onValueChange={(next) =>
          onChange(typeof next === 'number' ? next : next[0])
        }
      />
    </div>
  )
}

export function DrawerSidebar() {
  const config = useDrawerStore((state) => state.config)
  const setConfig = useDrawerStore((state) => state.setConfig)
  const resetConfig = useDrawerStore((state) => state.resetConfig)

  const [collapsed, setCollapsed] = useState(false)
  const [cutlistOpen, setCutlistOpen] = useState(false)

  if (collapsed) {
    return (
      <aside className="flex h-full w-11 shrink-0 items-start justify-center border-l bg-card pt-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          aria-label="Expand drawer settings"
        >
          <ChevronLeft className="size-4" />
        </Button>
      </aside>
    )
  }

  const isOutset = config.faceType === 'outset'

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <PanelRightClose className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Drawer Settings</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse drawer settings"
        >
          <ChevronRight className="size-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Opening space
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Width"
                value={config.openingW}
                min={100}
                max={2000}
                onChange={(v) => setConfig({ openingW: v })}
              />
              <NumberField
                label="Height"
                value={config.openingH}
                min={40}
                max={1000}
                onChange={(v) => setConfig({ openingH: v })}
              />
            </div>
            <NumberField
              label="Depth"
              value={config.openingD}
              min={100}
              max={2000}
              onChange={(v) => setConfig({ openingD: v })}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Slides
            </h3>
            <NumberField
              label="Rail thickness"
              value={config.slideThickness}
              min={1}
              max={60}
              onChange={(v) => setConfig({ slideThickness: v })}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Drawer box
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Panel thickness"
                value={config.boxThickness}
                min={6}
                max={30}
                onChange={(v) => setConfig({ boxThickness: v })}
              />
              <NumberField
                label="Bottom thickness"
                value={config.bottomThickness}
                min={3}
                max={30}
                onChange={(v) => setConfig({ bottomThickness: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Sides and back use the panel thickness; the face is a separate
              attachment fastened to the box front.
            </p>
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Face
            </h3>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Style</Label>
              <Select
                value={config.faceType}
                onValueChange={(v) =>
                  setConfig({ faceType: v as DrawerConfig['faceType'] })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inset">Inset — flush with opening</SelectItem>
                  <SelectItem value="outset">Outset — overlaps carcass</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isOutset && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3">
                <NumberField
                  label="Border · sides"
                  value={config.outsetSides}
                  min={0}
                  max={200}
                  onChange={(v) => setConfig({ outsetSides: v })}
                />
                <NumberField
                  label="Border · top/bottom"
                  value={config.outsetTopBottom}
                  min={0}
                  max={200}
                  onChange={(v) => setConfig({ outsetTopBottom: v })}
                />
              </div>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Pull-out
            </h3>
            <SliderField
              label="Drawer extension"
              value={config.pullOut}
              onChange={(v) => setConfig({ pullOut: v })}
            />
            <p className="text-xs text-muted-foreground">
              {config.pullOut === 0
                ? 'Drawer is fully closed.'
                : config.pullOut >= 100
                  ? 'Drawer is fully extended.'
                  : 'Drawer partially pulled out.'}
            </p>
          </section>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t p-4">
        <Button
          variant="default"
          className="w-full"
          onClick={() => setCutlistOpen(true)}
        >
          <ListChecks className="size-4" />
          View cutlist
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={resetConfig}
          disabled={JSON.stringify(config) === JSON.stringify(DEFAULT_CONFIG)}
        >
          <RotateCcw className="size-4" />
          Reset defaults
        </Button>
      </footer>

      <CutlistDialog open={cutlistOpen} onOpenChange={setCutlistOpen} />
    </aside>
  )
}
