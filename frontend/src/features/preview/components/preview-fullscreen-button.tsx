import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Maximize2, Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EDITOR_LAYOUT_CSS_VALUES } from '@/config/editor-layout'
import { isPreviewFullscreen, togglePreviewFullscreen } from '../utils/preview-fullscreen'

/**
 * Fullscreen toggle for the program monitor. Fullscreens the `[data-preview-monitor]` element the
 * button sits in, so the canvas fills the screen together with its playback and zoom controls;
 * Escape leaves fullscreen as usual, and `Ctrl+`` does the same from the keyboard.
 */
export function PreviewFullscreenButton() {
  const { t } = useTranslation()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const sync = () => setIsFullscreen(isPreviewFullscreen())
    sync()
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggleFullscreen = useCallback(() => {
    void togglePreviewFullscreen(buttonRef.current?.closest('[data-preview-monitor]'))
  }, [])

  const label = isFullscreen ? t('preview.player.exitFullscreen') : t('preview.player.fullscreen')

  return (
    <Button
      ref={buttonRef}
      variant="ghost"
      className="flex-shrink-0 px-1.5 text-muted-foreground hover:text-foreground"
      style={{
        height: EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize,
        width: EDITOR_LAYOUT_CSS_VALUES.previewControlButtonSize,
      }}
      onClick={toggleFullscreen}
      aria-label={label}
      aria-pressed={isFullscreen}
      data-tooltip={label}
    >
      {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </Button>
  )
}
