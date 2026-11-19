import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clapperboard, Loader2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useProjectStore } from '../deps/editor'
import { MOTION_TEMPLATES, motionPage } from '../services/motion-render'
import { makeMotionClip, motionName } from '../services/motion-clip'
import { useGenerateStore } from '../stores/generate-store'

/**
 * HTML graphics, as WeftCut's Motifs: titles, lower thirds, counters and badges written as HTML and CSS, by the
 * person or an agent, previewed live and made into a clip with transparency over the video below.
 */
export function MotionPanel() {
  const { t } = useTranslation()
  const projectId = useProjectStore((state) => state.currentProject?.id ?? null)
  const metadata = useProjectStore((state) => state.currentProject?.metadata)
  const made = useGenerateStore((state) => state.motionClips).filter((clip) => clip.projectId === projectId)
  const { html, seconds } = useGenerateStore((state) => state.motionDraft) ?? MOTION_TEMPLATES[0]!
  const setDraft = useGenerateStore((state) => state.setMotionDraft)
  const [share, setShare] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const width = metadata?.width ?? 1920
  const height = metadata?.height ?? 1080
  const srcDoc = useMemo(
    () => motionPage(html, width, height),
    [html, width, height],
  )
  const scale = 288 / width

  if (!projectId) return <p className="p-3 text-xs text-muted-foreground">{t('generate.storyboard.noProject')}</p>

  const make = async () => {
    setError(null)
    setDone(null)
    setShare(0)
    try {
      const name = motionName(html, t('generate.motion.defaultName'))
      await makeMotionClip(html, seconds, name, setShare)
      setDone(name)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      setShare(null)
    }
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="motion-panel">
      <div className="space-y-3 p-3">
        <p className="text-[11px] text-muted-foreground">{t('generate.motion.hint')}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {MOTION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => {
                setDraft({ html: template.html, seconds: template.seconds })
              }}
              className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-left text-[11px] text-[var(--color-muted)] hover:border-[var(--color-overlay)] hover:text-[var(--color-text)]"
            >
              {t(`generate.motion.templates.${template.id}`)}
            </button>
          ))}
        </div>
        <div className="relative overflow-hidden rounded-md border border-[var(--color-border)] bg-[repeating-conic-gradient(#1c1c20_0_25%,#141416_0_50%)] bg-[length:16px_16px]" style={{ width: 288, height: height * scale }}>
          <iframe
            title={t('generate.motion.preview')}
            sandbox="allow-same-origin"
            srcDoc={srcDoc}
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="motion-code" className="text-[11px] text-muted-foreground">
            {t('generate.motion.code')}
          </Label>
          <Textarea id="motion-code" value={html} onChange={(event) => setDraft({ html: event.target.value, seconds })} spellCheck={false} className="min-h-48 resize-y bg-secondary/30 font-mono text-[11px]" />
        </div>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {t('generate.motion.seconds')}
          <Input type="number" min={1} max={30} step={0.5} value={seconds} onChange={(event) => setDraft({ html, seconds: Math.min(30, Math.max(1, Number(event.target.value) || 1)) })} className="h-7 w-16 px-1 text-center text-xs" />
        </label>
        {error && <p className="break-words rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">{t('generate.motion.failed', { reason: error })}</p>}
        {done && <p className="text-[11px] text-muted-foreground">{t('generate.motion.done', { name: done })}</p>}
        <Button className="bg-brand h-9 w-full gap-2" disabled={share !== null || !html.trim()} onClick={() => void make()}>
          {share !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          {share !== null ? t('generate.motion.rendering', { percent: Math.round(share * 100) }) : t('generate.motion.make')}
        </Button>
        {made.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2">
            <p className="text-[11px] font-medium text-muted-foreground">{t('generate.motion.made')}</p>
            <ul className="space-y-0.5">
              {made.map((clip, index) => (
                <li key={clip.mediaId ?? index}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft({ html: clip.html, seconds: clip.seconds })
                    }}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-secondary/60"
                    title={t('generate.motion.edit')}
                  >
                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{clip.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
