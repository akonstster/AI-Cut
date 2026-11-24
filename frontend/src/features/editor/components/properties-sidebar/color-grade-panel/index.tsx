import { lazy, memo, Suspense, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Palette } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useSelectionStore } from '@/shared/state/selection'
import { useEditorStore } from '@/shared/state/editor'
import { useItemsStore } from '@/features/editor/deps/timeline-store'
import { KeyframeGraphPanel } from '@/features/editor/deps/timeline-keyframe-ui'
import { addAdjustmentLayer } from '@/features/editor/utils/add-adjustment-layer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import type { TimelineItem } from '@/types/timeline'

// Both lazy sections come from one module; share a single import promise so
// they resolve together (and to the same module instance) whatever renders first.
let effectsContractPromise: Promise<
  typeof import('@/features/editor/deps/effects-contract')
> | null = null
const loadEffectsContract = () => {
  effectsContractPromise ??= import('@/features/editor/deps/effects-contract')
  return effectsContractPromise
}

const LazyColorGradeSection = lazy(() =>
  loadEffectsContract().then((module) => ({
    default: module.ColorGradeSection,
  })),
)
const LazyEffectsSection = lazy(() =>
  loadEffectsContract().then((module) => ({
    default: module.EffectsSection,
  })),
)

/**
 * Color workspace inspector: always-visible grade controls (wheels + curves)
 * on top, with the remaining effect stack below. Shown in place of the
 * regular clip panel while the Color workspace is active.
 */
const COLOR_PANEL_EFFECT_TYPES = ['gpu-color-wheels', 'gpu-curves'] as const
const COLOR_KEYFRAME_VISIBLE_GROUPS = ['effects'] as const
const COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH = 220

interface ColorGradePanelProps {
  layout?: 'sidebar' | 'dock'
  keyframesLaneOpen?: boolean
}

export const ColorGradePanel = memo(function ColorGradePanel({
  layout = 'sidebar',
  keyframesLaneOpen = false,
}: ColorGradePanelProps) {
  const { t } = useTranslation()
  const colorParamsTab = useEditorStore((s) => s.colorParamsTab)
  const setColorParamsTab = useEditorStore((s) => s.setColorParamsTab)
  const selectedItemIds = useSelectionStore((s) => s.selectedItemIds)
  const visualItems = useItemsStore(
    useShallow(
      useCallback(
        (s) => {
          const items: TimelineItem[] = []
          for (const itemId of selectedItemIds) {
            const item = s.itemById[itemId]
            if (item && item.type !== 'audio') {
              items.push(item)
            }
          }
          return items
        },
        [selectedItemIds],
      ),
    ),
  )

  const handleCreateAdjustmentLayer = useCallback(() => {
    addAdjustmentLayer(undefined, t('editor.colorPanel.adjustmentLayerLabel'))
  }, [t])
  const handleKeepKeyframesOpen = useCallback(() => {
    // The Color page owns this dock; the shared keyframe editor needs a close
    // callback for its sidebar placement but the color lane is intentionally fixed.
  }, [])

  const hasVisualSelection = useMemo(() => visualItems.length > 0, [visualItems])

  if (!hasVisualSelection) {
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Palette className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">{t('editor.colorPanel.emptyState')}</p>
      </div>
    )
  }

  const sectionClassName = layout === 'dock' ? 'min-h-0 overflow-hidden' : undefined

  if (layout === 'dock') {
    const gradeColumn = (
      <div className="h-full min-h-0 overflow-hidden">
        <LazyColorGradeSection
          items={visualItems}
          layout={layout}
          paramsTab={colorParamsTab}
          onParamsTabChange={setColorParamsTab}
          onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
        />
      </div>
    )
    const effectsColumn = (
      <div className="h-full min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35">
        <LazyEffectsSection
          items={visualItems}
          hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES}
          layout="dock"
        />
      </div>
    )
    return (
      <div
        className="h-full min-h-0"
        data-testid="color-dock-layout"
        data-keyframes-lane={String(keyframesLaneOpen)}
      >
        <Suspense fallback={null}>
          {/* Resizable columns (Premiere/Resolve panels): keyframes | effects |
              grade. Sizes persist per lane configuration. */}
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId={keyframesLaneOpen ? 'color-dock:with-keyframes' : 'color-dock'}
          >
            {keyframesLaneOpen && (
              <>
                <ResizablePanel id="color-keyframes" order={1} defaultSize={34} minSize={20}>
                  <div
                    className="h-full min-h-0 overflow-hidden rounded-[3px] border border-border/70 bg-background/35"
                    data-testid="color-keyframes-lane"
                  >
                    <KeyframeGraphPanel
                      isOpen={true}
                      placement="side"
                      showCloseButton={false}
                      onClose={handleKeepKeyframesOpen}
                      initialVisibleGroupIds={COLOR_KEYFRAME_VISIBLE_GROUPS}
                      propertyColumnWidth={COLOR_KEYFRAME_PROPERTY_COLUMN_WIDTH}
                    />
                  </div>
                </ResizablePanel>
                <ResizableHandle className="mx-1 bg-transparent hover:bg-primary/40" />
              </>
            )}
            <ResizablePanel
              id="color-effects"
              order={2}
              defaultSize={keyframesLaneOpen ? 16 : 20}
              minSize={12}
            >
              {effectsColumn}
            </ResizablePanel>
            <ResizableHandle className="mx-1 bg-transparent hover:bg-primary/40" />
            <ResizablePanel
              id="color-grade"
              order={3}
              defaultSize={keyframesLaneOpen ? 50 : 80}
              minSize={35}
            >
              {gradeColumn}
            </ResizablePanel>
          </ResizablePanelGroup>
        </Suspense>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <Suspense fallback={null}>
        <div className={sectionClassName}>
          <LazyColorGradeSection
            items={visualItems}
            layout={layout}
            onCreateAdjustmentLayer={handleCreateAdjustmentLayer}
          />
        </div>
        <div className={sectionClassName}>
          <LazyEffectsSection items={visualItems} hiddenGpuEffectTypes={COLOR_PANEL_EFFECT_TYPES} />
        </div>
      </Suspense>
    </div>
  )
})
