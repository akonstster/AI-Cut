import { useTranslation } from 'react-i18next'
import { Activity } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { useEditorStore } from '@/shared/state/editor'
import { cn } from '@/shared/ui/cn'

/**
 * Opens/closes the Color-page scopes panel docked to the right of the program
 * monitor. Resolve-style: the same button that shows the scopes also hides them,
 * and the state lives in the workspace layout so it survives reloads.
 */
export function PreviewScopesToggle() {
  const { t } = useTranslation()
  const open = useEditorStore((s) => s.colorScopesOpen)
  const label = open ? t('preview.scopes.hide') : t('preview.scopes.show')

  return (
    <Button
      variant="ghost"
      className={cn(
        'flex-shrink-0 px-1.5 text-muted-foreground hover:text-foreground',
        open && 'bg-muted/60 text-foreground',
      )}
      style={{
        height: EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize,
        width: EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize,
      }}
      onClick={() => useEditorStore.getState().toggleColorScopesOpen()}
      aria-label={label}
      aria-pressed={open}
      data-tooltip={label}
    >
      <Activity className="h-3.5 w-3.5" />
    </Button>
  )
}
