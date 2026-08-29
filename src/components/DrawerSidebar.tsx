import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react'

import { SettingsDialog } from '@/components/SettingsDialog'
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
import { DEFAULT_CONFIG, clamp, type DrawerConfig } from '@/lib/drawer'
import { UNIT_LABEL, formatMm, unitToMm } from '@/lib/units'
import { useDrawerStore, selectSelectedConfig } from '@/store/useDrawerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}) {
  const displayUnit = useSettingsStore((state) => state.displayUnit)
  const [draft, setDraft] = useState<string | null>(null)
  const [prevValue, setPrevValue] = useState(value)

  // Adjust state during render when the value changes externally (e.g. reset)
  if (prevValue !== value) {
    setPrevValue(value)
    setDraft(null)
  }

  const shown = draft ?? formatMm(value, displayUnit)

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={formatMm(min, displayUnit)}
          max={formatMm(max, displayUnit)}
          step={displayUnit === 'in' ? 0.125 : displayUnit === 'cm' ? 0.5 : 1}
          value={shown}
          onChange={(event) => {
            setDraft(event.target.value)
            const parsed = parseFloat(event.target.value)
            if (!Number.isNaN(parsed)) {
              onChange(clamp(unitToMm(parsed, displayUnit), min, max))
            }
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">
          {UNIT_LABEL[displayUnit]}
        </span>
      </div>
    </div>
  )
}

interface DrawerSidebarProps {
  /** When provided (mobile overlay mode), shows a close button */
  onClose?: () => void
  /** Collapsed to the expand rail; controlled by the parent so the layout width can follow. */
  collapsed?: boolean
  /** Called when the user toggles between the full sidebar and the expand rail. */
  onCollapsedChange?: (collapsed: boolean) => void
}

export function DrawerSidebar({
  onClose,
  collapsed = false,
  onCollapsedChange,
}: DrawerSidebarProps) {
  const config = useDrawerStore(selectSelectedConfig)
  const setConfig = useDrawerStore((state) => state.setConfig)
  const resetConfig = useDrawerStore((state) => state.resetConfig)

  const [settingsOpen, setSettingsOpen] = useState(false)

  if (collapsed) {
    return (
      <aside className="flex h-full w-full shrink-0 items-start justify-center border-l bg-card pt-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onCollapsedChange?.(false)}
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
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
          >
            <Settings2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapsedChange?.(true)}
            aria-label="Collapse drawer settings"
            className="hidden md:inline-flex"
          >
            <ChevronRight className="size-4" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close settings panel"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
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

            <NumberField
              label="Face thickness"
              value={config.faceThickness}
              min={6}
              max={40}
              onChange={(v) => setConfig({ faceThickness: v })}
            />
            {!isOutset && (
              <p className="text-xs text-muted-foreground">
                Inset face sits inside the opening, flush with the carcass
                front; the box depth is reduced by the face thickness.
              </p>
            )}
          </section>
        </div>
      </div>

      <footer className="flex flex-col gap-2 border-t p-4">
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </aside>
  )
}
