import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ZoomIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { usePreviewZoom } from '../hooks/use-preview-zoom'

export function PreviewZoomControls() {
  const { t } = useTranslation()
  const { zoom, zoomPresets, handlePresetZoom } = usePreviewZoom()
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Fullscreen shows only the monitor element: a menu portalled into <body> would stay behind it.
  // Inside fullscreen the menu is rendered into that element instead.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const sync = () => {
      const fullscreen = document.fullscreenElement
      setPortalContainer(fullscreen instanceof HTMLElement ? fullscreen : null)
    }
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const currentLabel =
    zoom === -1
      ? t('preview.zoom.auto')
      : zoomPresets.find((p) => p.value === zoom)?.label || `${Math.round(zoom * 100)}%`

  const blurTrigger = useCallback(() => {
    triggerRef.current?.blur()
  }, [])

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) requestAnimationFrame(blurTrigger)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          className="flex-shrink-0 text-muted-foreground hover:text-foreground gap-1 px-1.5"
          style={{ height: EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize }}
          data-tooltip={t('preview.zoom.tooltip', { label: currentLabel })}
          aria-label={t('preview.zoom.ariaLabel', { label: currentLabel })}
          onKeyDown={(e) => {
            // Space is reserved for global play/pause
            if (e.key === ' ' || e.code === 'Space') e.preventDefault()
          }}
        >
          <ZoomIn className="w-3.5 h-3.5" />
          <span className="text-[10px] leading-none">{currentLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        container={portalContainer}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          requestAnimationFrame(blurTrigger)
        }}
      >
        {zoomPresets.map((preset) => (
          <DropdownMenuItem
            key={preset.label}
            className="text-xs"
            onSelect={() => handlePresetZoom(preset)}
          >
            <span
              className={
                zoom === preset.value || (preset.value === 'fit' && zoom === -1)
                  ? 'font-semibold'
                  : ''
              }
            >
              {preset.label}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
