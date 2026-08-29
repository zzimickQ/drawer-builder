import { useState } from 'react'

import { DrawerListPanel } from '@/components/DrawerListPanel'
import { DrawerSidebar } from '@/components/DrawerSidebar'
import { DrawerViewport } from '@/components/DrawerViewport'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { cn } from '@/lib/utils'

type MobilePanel = 'drawers' | 'settings' | null

function App() {
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)

  return (
    <div className="relative flex h-svh w-full overflow-hidden bg-background">
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
        />
      </div>

      <main className="relative min-w-0 flex-1">
        <DrawerViewport
          onOpenDrawers={() => setMobilePanel('drawers')}
          onOpenSettings={() => setMobilePanel('settings')}
        />
      </main>

      {/* Settings sidebar — inline on md+, slides in from the right on mobile */}
      <div
        className={cn(
          'absolute inset-y-0 right-0 z-40 w-80 max-w-[85vw] transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          mobilePanel === 'settings' ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <DrawerSidebar
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

      {/* First-run defaults dialog */}
      <OnboardingDialog />
    </div>
  )
}

export default App
