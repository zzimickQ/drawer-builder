import { useState } from 'react'
import { Hammer } from 'lucide-react'

import { NumberField } from '@/components/DrawerSidebar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DEFAULT_DEFAULTS,
  type DrawerDefaults,
} from '@/lib/drawer'
import { useDrawerStore } from '@/store/useDrawerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

/**
 * First-run dialog: sets the construction defaults (slide rail, panel and
 * bottom thickness, face style and thickness) that every new drawer starts
 * from. Completing it also creates the first drawer.
 */
export function OnboardingDialog() {
  const defaultsConfigured = useSettingsStore(
    (state) => state.defaultsConfigured,
  )
  const saveDefaults = useSettingsStore((state) => state.saveDefaults)
  const drawers = useDrawerStore((state) => state.drawers)
  const addDrawer = useDrawerStore((state) => state.addDrawer)

  const [defaults, setDefaults] = useState<DrawerDefaults>(DEFAULT_DEFAULTS)

  const set = (patch: Partial<DrawerDefaults>) =>
    setDefaults((prev) => ({ ...prev, ...patch }))

  const handleSave = () => {
    saveDefaults(defaults)
    if (drawers.length === 0) {
      addDrawer()
    }
  }

  return (
    <Dialog
      open={!defaultsConfigured}
      onOpenChange={() => {
        // Mandatory on first launch — no dismissing.
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        // Trap focus inside: no escape hatch on first run
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="size-4" />
            Welcome — set your defaults
          </DialogTitle>
          <DialogDescription>
            These construction defaults will be applied to every new drawer.
            You can change them per-drawer later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <NumberField
            label="Slide rail thickness"
            value={defaults.slideThickness}
            min={1}
            max={60}
            onChange={(slideThickness) => set({ slideThickness })}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Panel thickness"
              value={defaults.boxThickness}
              min={6}
              max={30}
              onChange={(boxThickness) => set({ boxThickness })}
            />
            <NumberField
              label="Bottom thickness"
              value={defaults.bottomThickness}
              min={3}
              max={30}
              onChange={(bottomThickness) => set({ bottomThickness })}
            />
          </div>
          <NumberField
            label="Face thickness"
            value={defaults.faceThickness}
            min={6}
            max={40}
            onChange={(faceThickness) => set({ faceThickness })}
          />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Face style</Label>
            <Select
              value={defaults.faceType}
              onValueChange={(value) =>
                set({ faceType: value as DrawerDefaults['faceType'] })
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
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={handleSave}>
            Create first drawer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
