import { Canvas } from '@react-three/fiber'
import { Info } from 'lucide-react'

import { DrawerScene } from '@/components/DrawerScene'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { useDrawerStore } from '@/store/useDrawerStore'

const SHORTCUTS: { keys: string[]; action: string }[] = [
  { keys: ['Left-drag'], action: 'Rotate the view' },
  { keys: ['Scroll wheel'], action: 'Zoom in / out' },
  { keys: ['Shift + drag'], action: 'Pan (right-drag also works)' },
  { keys: ['Pinch'], action: 'Zoom (trackpad)' },
]

function NavHelp() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="View navigation help"
          />
        }
      >
        <Info className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80">
        <p className="text-sm font-medium">View navigation</p>
        <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
          {SHORTCUTS.map(({ keys, action }) => (
            <li key={action} className="flex items-center justify-between gap-3">
              <span>{action}</span>
              <span className="flex shrink-0 gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export function DrawerViewport() {
  const config = useDrawerStore((state) => state.config)
  const carcassOpacity = useDrawerStore((state) => state.carcassOpacity)
  const setCarcassOpacity = useDrawerStore((state) => state.setCarcassOpacity)

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Canvas
        className="absolute inset-0"
        camera={{ position: [4.2, 3, 5.6], fov: 45 }}
        dpr={[1, 2]}
      >
        <DrawerScene config={config} carcassOpacity={carcassOpacity} />
      </Canvas>

      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <NavHelp />
        <div className="flex items-center gap-2 rounded-md border bg-background/85 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
          <span className="whitespace-nowrap">Carcass</span>
          <Slider
            className="w-44! shrink-0"
            min={0}
            max={100}
            step={1}
            value={carcassOpacity}
            onValueChange={(next) =>
              setCarcassOpacity(typeof next === 'number' ? next : next[0])
            }
            aria-label="Carcass opacity"
          />
          <span className="w-7 text-right tabular-nums">{carcassOpacity}%</span>
        </div>
      </div>

      <div className="absolute top-3 right-3 z-10 rounded-md border bg-background/85 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
        Pull-out: {Math.round(config.pullOut)}%
      </div>

      <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md border bg-background/85 px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap backdrop-blur-sm">
        Left-drag rotate · Scroll zoom · Shift-drag pan
      </div>
    </div>
  )
}
