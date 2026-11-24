import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Diamond } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useColorPlayheadAutoSelect } from '../hooks/use-color-playhead-auto-select'
import { ColorGradePanel } from './properties-sidebar/color-grade-panel'

export const ColorGradingDock = memo(function ColorGradingDock() {
  const { t } = useTranslation()
  useColorPlayheadAutoSelect()
  // The keyframe lane is a secondary surface: it stays closed until asked for,
  // leaving the grade dock to the wheels / curves / LUT tabs.
  const [keyframesLaneOpen, setKeyframesLaneOpen] = useState(false)
  const keyframesLabel = t('editor.colorPanel.keyframesToggle')

  return (
    <section
      className="panel-bg flex h-full min-h-0 flex-col border-t border-border"
      aria-label={t('editor.colorPanel.dockLabel')}
      data-testid="color-grading-dock"
    >
      <div className="flex h-6 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 flex-shrink-0 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
          aria-pressed={keyframesLaneOpen}
          aria-label={keyframesLabel}
          data-tooltip={keyframesLabel}
          data-testid="color-keyframes-toggle"
          onClick={() => setKeyframesLaneOpen((open) => !open)}
        >
          <Diamond className="h-3 w-3" aria-hidden="true" />
          <span className="truncate">{t('editor.colorPanel.keyframes')}</span>
        </Button>
        <span className="ml-auto truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('editor.colorPanel.dockTitle')}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-2">
        <ColorGradePanel layout="dock" keyframesLaneOpen={keyframesLaneOpen} />
      </div>
    </section>
  )
})
