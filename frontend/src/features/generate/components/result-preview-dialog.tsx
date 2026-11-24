import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { generateApi, type Job, type OutputFile } from '../services/generate-api'

/**
 * A generation result viewed large, opened by a click in the Generate panel — the same full-window
 * look the media library gives its own files. Videos never come here: they keep their own full
 * screen player.
 */
export function ResultPreviewDialog({
  job,
  output,
  onClose,
}: {
  job: Job
  output: OutputFile
  onClose: () => void
}) {
  const { t } = useTranslation()
  const url = generateApi.fileUrl(job.id, output.index)
  const [failed, setFailed] = useState(false)
  const fail = () => setFailed(true)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[min(90dvh,1100px)] w-[min(96vw,1600px)] max-w-none flex-col gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="truncate px-4 py-3 pr-12 text-sm leading-6" title={output.file}>
          {output.file}
        </DialogTitle>
        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] place-items-center overflow-hidden bg-black">
          {failed ? (
            <p role="status" className="px-4 text-sm text-white/75">
              {t('generate.result.unavailable')}
            </p>
          ) : output.kind === 'image' ? (
            <img
              src={url}
              alt={output.file}
              className="h-full min-h-0 w-full object-contain"
              onError={fail}
            />
          ) : output.kind === 'audio' ? (
            <div className="w-[min(90%,720px)] px-6">
              <audio
                src={url}
                aria-label={output.file}
                className="w-full"
                controls
                autoPlay
                onError={fail}
              />
            </div>
          ) : output.kind === 'text' ? (
            <pre className="max-h-full w-full overflow-auto whitespace-pre-wrap px-6 py-4 text-left font-sans text-sm text-white/85">
              {output.text}
            </pre>
          ) : (
            <a href={url} className="text-sm text-white underline">
              {output.file}
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
