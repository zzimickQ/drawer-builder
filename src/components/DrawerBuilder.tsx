import { useState } from 'react'

import { DrawerListPanel } from '@/components/DrawerListPanel'
import { DrawerSidebar } from '@/components/DrawerSidebar'
import { DrawerViewport } from '@/components/DrawerViewport'
import { cn } from '@/lib/utils'

type MobilePanel = 'drawers' | 'settings' | null

interface DrawerBuilderProps {
  /** Switches the app to the cutlist tool. */
  onOpenCutlist?: () => void
}

/**
 * The drawer builder tool: drawer list (left), 3D viewport (center) and
 * drawer settings (right). Rendered as one of the app's main tabs.
 */
export function DrawerBuilder({ onOpenCutlist }: DrawerBuilderProps) {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const [settingsCollapsed, setSettingsCollapsed] = useState(false)

  // The settings sidebar is expanded on desktop unless collapsed to the rail;
  // the mobile slide-in overlay always opens expanded.
  const settingsExpanded = mobilePanel === 'settings' || !settingsCollapsed

  return (
    <div className="relative flex h-full w-full overflow-hidden">
      {/* Drawers panel — inline on md+, slides in as an overlay on mobile */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 z-40 w-64 max-w-[85vw] transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobilePanel === 'drawers' ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <DrawerListPanel
          onClose={
            mobilePanel === 'drawers' ? () => setMobilePanel(null) : undefined
          }
          onOpenCutlist={onOpenCutlist}
        />
      </div>

      <main className="relative min-w-0 flex-1">
        <DrawerViewport
          onOpenDrawers={() => setMobilePanel('drawers')}
          onOpenSettings={() => {
            setSettingsCollapsed(false)
            setMobilePanel('settings')
          }}
        />
      </main>

      {/* Settings sidebar — inline on md+, slides in from the right on mobile */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 z-40 max-w-[85vw] transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          settingsExpanded ? 'w-80' : 'w-11',
          mobilePanel === 'settings' ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <DrawerSidebar
          collapsed={settingsCollapsed}
          onCollapsedChange={setSettingsCollapsed}
          onClose={
            mobilePanel === 'settings' ? () => setMobilePanel(null) : undefined
          }
        />
      </div>

      {/* Backdrop on mobile while a panel is open */}
      {mobilePanel !== null && (
        <div
          className="absolute inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobilePanel(null)}
        />
      )}
    </div>
  )
}
