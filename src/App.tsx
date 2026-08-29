import { DrawerSidebar } from '@/components/DrawerSidebar'
import { DrawerViewport } from '@/components/DrawerViewport'

function App() {
  return (
    <div className="flex h-svh w-full overflow-hidden bg-background">
      <main className="relative min-w-0 flex-1">
        <DrawerViewport />
      </main>
      <DrawerSidebar />
    </div>
  )
}

export default App
