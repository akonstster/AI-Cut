import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { MediaMetadata } from '@/types/storage'
import { resolveMediaUrl, resolveProxyUrl } from '../utils/media-resolver'

export function MediaPreviewDialog({
  media,
  onClose,
}: {
  media: MediaMetadata
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string>()
  const isVideo = media.mimeType.startsWith('video/')

  useEffect(() => {
    let active = true
    void resolveMediaUrl(media.id).then(
      (source) => { if (active) setUrl(source) },
      () => { if (active) setUrl('') },
    )
    return () => { active = false }
  }, [media.id])

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(90dvh,1100px)] w-[min(96vw,1600px)] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="truncate px-4 py-3 pr-12 text-sm leading-6" title={media.fileName}>
          {media.fileName}
        </DialogTitle>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-black">
          {url ? (
            isVideo ? (
              <video
                key={url}
                src={url}
                aria-label={media.fileName}
                className="h-full min-h-0 w-full object-contain"
                controls
                playsInline
                preload="metadata"
                onError={() => {
                  const proxy = resolveProxyUrl(media.id)
                  setUrl(proxy && proxy !== url ? proxy : '')
                }}
              />
            ) : (
              <img
                src={url}
                alt={media.fileName}
                className="h-full min-h-0 w-full object-contain"
                onError={() => setUrl('')}
              />
            )
          ) : (
            <p role="status" className="px-4 text-sm text-white/75">
              {t(url === undefined ? 'media.grid.loadingTitle' : 'media.card.previewUnavailable')}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
