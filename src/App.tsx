import { useState } from 'react'
import { Box, Scissors } from 'lucide-react'

import { CutlistTab } from '@/components/CutlistTab'
import { DrawerBuilder } from '@/components/DrawerBuilder'
import { OnboardingDialog } from '@/components/OnboardingDialog'
import { cn } from '@/lib/utils'

type View = 'design' | 'cutlist'

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors outline-none sm:px-4',
        'focus-visible:bg-muted',
        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
      {active && (
        <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
      )}
    </button>
  )
}

function App() {
  const [view, setView] = useState<View>('design')

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background">
      {/* Main tool tabs */}
      <header
        role="tablist"
        aria-label="Tools"
        className="flex h-11 shrink-0 items-stretch gap-1 border-b bg-card px-2 sm:px-3"
      >
        <TabButton
          active={view === 'design'}
          onClick={() => setView('design')}
          icon={<Box className="size-4" />}
          label="Drawer Builder"
        />
        <TabButton
          active={view === 'cutlist'}
          onClick={() => setView('cutlist')}
          icon={<Scissors className="size-4" />}
          label="Cutlist"
        />
      </header>

      <div className="min-h-0 flex-1">
        {view === 'design' ? (
          <DrawerBuilder onOpenCutlist={() => setView('cutlist')} />
        ) : (
          <CutlistTab />
        )}
      </div>

      <OnboardingDialog />
    </div>
  )
}

export default App
