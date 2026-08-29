import { useState } from 'react'
import { ListChecks, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UNIT_LABEL, formatMm } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useDrawerStore } from '@/store/useDrawerStore'
import { useSettingsStore } from '@/store/useSettingsStore'

interface DrawerListPanelProps {
  /** When provided (mobile overlay mode), shows a close button */
  onClose?: () => void
  /** Switches the main area to the cutlist optimization tab */
  onOpenCutlist?: () => void
}

export function DrawerListPanel({ onClose, onOpenCutlist }: DrawerListPanelProps) {
  const drawers = useDrawerStore((state) => state.drawers)
  const selectedId = useDrawerStore((state) => state.selectedId)
  const selectDrawer = useDrawerStore((state) => state.selectDrawer)
  const addDrawer = useDrawerStore((state) => state.addDrawer)
  const removeDrawer = useDrawerStore((state) => state.removeDrawer)
  const renameDrawer = useDrawerStore((state) => state.renameDrawer)
  const displayUnit = useSettingsStore((state) => state.displayUnit)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  const startEdit = (id: string, name: string) => {
    setEditingId(id)
    setNameDraft(name)
  }

  const commitEdit = () => {
    if (editingId) {
      const trimmed = nameDraft.trim()
      if (trimmed) renameDrawer(editingId, trimmed)
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r bg-card">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-3">
        <h2 className="text-sm font-semibold">Drawers</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={addDrawer}
            aria-label="Add drawer"
            title="Add drawer"
          >
            <Plus className="size-4" />
          </Button>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close drawers panel"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {drawers.map((drawer) => {
          const selected = drawer.id === selectedId
          return (
            <div
              key={drawer.id}
              role="button"
              tabIndex={0}
              onClick={() => selectDrawer(drawer.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  selectDrawer(drawer.id)
                }
              }}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 outline-none',
                selected
                  ? 'border-primary bg-accent'
                  : 'border-transparent hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
              )}
            >
              <div className="min-w-0 flex-1">
                {editingId === drawer.id ? (
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={commitEdit}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitEdit()
                      } else if (event.key === 'Escape') {
                        cancelEdit()
                      }
                    }}
                    className="h-6 px-1.5 text-sm"
                    aria-label="Drawer name"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      startEdit(drawer.id, drawer.name)
                    }}
                    className="block max-w-full truncate rounded px-0.5 text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    title="Rename drawer"
                  >
                    {drawer.name}
                  </button>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {formatMm(drawer.config.openingW, displayUnit)} ×{' '}
                  {formatMm(drawer.config.openingH, displayUnit)} ×{' '}
                  {formatMm(drawer.config.openingD, displayUnit)}{' '}
                  {UNIT_LABEL[displayUnit]}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                disabled={drawers.length <= 1}
                onClick={(event) => {
                  event.stopPropagation()
                  removeDrawer(drawer.id)
                }}
                aria-label={`Delete ${drawer.name}`}
                title={`Delete ${drawer.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>

      <footer className="border-t p-3">
        <Button className="w-full" onClick={onOpenCutlist}>
          <ListChecks className="size-4" />
          View cutlist
        </Button>
      </footer>
    </aside>
  )
}
