import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Combobox } from '@/components/ui/combobox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/shared/ui/cn'
import { generateApi, type Field, type MediaKind, type MediaRef } from '../services/generate-api'
import { getMediaDragData, mediaLibraryService, useMediaLibraryStore } from '../deps/editor'

/** Drag payload of a finished generation's file. */
export const OUTPUT_DRAG_TYPE = 'application/x-AI-Cut-output'

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function kindOfMime(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return null
}

export function MediaThumb({ reference, full = false }: { reference: MediaRef; full?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems)
  const mediaId = typeof reference === 'object' && 'media' in reference ? reference.media : undefined
  const job = typeof reference === 'object' && 'job' in reference ? reference.job : undefined
  const index = typeof reference === 'object' && 'job' in reference ? reference.index : undefined
  useEffect(() => {
    let cancelled = false
    let ownedUrl: string | null = null
    setUrl(null)
    if (mediaId) {
      const lookup = full ? mediaLibraryService.getMediaBlobUrl(mediaId) : mediaLibraryService.getThumbnailBlobUrl(mediaId)
      void lookup.then((found) => {
        if (full && found) {
          if (cancelled) URL.revokeObjectURL(found)
          else ownedUrl = found
        }
        if (!cancelled) setUrl(found)
      }).catch(() => {
        if (!cancelled) setUrl(null)
      })
    } else if (job && index !== undefined) {
      setUrl(generateApi.fileUrl(job, index))
    }
    return () => {
      cancelled = true
      if (ownedUrl) URL.revokeObjectURL(ownedUrl)
    }
  }, [mediaId, job, index, full])
  const name =
    typeof reference === 'object' && 'media' in reference
      ? (mediaItems.find((item) => item.id === reference.media)?.fileName ?? reference.media)
      : typeof reference === 'object' && 'file' in reference
        ? reference.file
        : typeof reference === 'string'
          ? reference
          : `#${reference.index + 1}`
  return url ? (
    <img src={url} alt={name} className={full ? "h-full w-full object-contain" : "h-full w-full object-cover"} onError={() => setUrl(null)} />
  ) : (
    <span className="line-clamp-3 break-all p-1 text-[9px] text-muted-foreground">{name}</span>
  )
}

function MediaSlot({
  field,
  value,
  onChange,
}: {
  field: Extract<Field, { type: 'media' }>
  value: MediaRef[]
  onChange: (value: MediaRef[]) => void
}) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaItems = useMediaLibraryStore((state) => state.mediaItems)
  const candidates = mediaItems.filter((item) => kindOfMime(item.mimeType) === field.media)
  const full = value.length >= field.max

  const add = (references: MediaRef[]) => {
    setError(null)
    const next = [...value]
    for (const reference of references) {
      if (next.some((existing) => sameValue(existing, reference))) continue
      if (next.length >= field.max) {
        if (field.max === 1) next.splice(0, 1)
        else {
          setError(t('generate.form.tooMany', { max: field.max }))
          break
        }
      }
      next.push(reference)
    }
    onChange(next)
  }

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setOver(false)
    const output = event.dataTransfer.getData(OUTPUT_DRAG_TYPE)
    if (output) {
      const parsed = JSON.parse(output) as { job: string; index: number; mime: string }
      if (kindOfMime(parsed.mime) !== field.media) {
        setError(t('generate.form.wrongKind', { kind: t(`generate.media.${field.media}`) }))
        return
      }
      add([{ job: parsed.job, index: parsed.index }])
      return
    }
    const raw = event.dataTransfer.getData('application/json')
    const data = raw ? (JSON.parse(raw) as ReturnType<typeof getMediaDragData>) : getMediaDragData()
    if (!data) return
    const items: Array<{ mediaId?: string; mediaType?: string }> =
      data.type === 'media-item'
        ? [{ mediaId: data.mediaId, mediaType: data.mediaType }]
        : data.type === 'media-items'
          ? (data.items ?? []).map((item) => ({ mediaId: item.mediaId, mediaType: item.mediaType }))
          : []
    const fitting = items.filter((item): item is { mediaId: string; mediaType: string } => !!item.mediaId && item.mediaType === field.media)
    if (fitting.length < items.length) {
      setError(t('generate.form.wrongKind', { kind: t(`generate.media.${field.media}`) }))
    }
    add(fitting.map((item) => ({ media: item.mediaId })))
  }

  return (
    <div className="space-y-1">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid={`generate-media-${field.key}`}
        className={cn(
          'flex min-h-14 flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border bg-secondary/20 p-1.5',
          over && 'border-primary bg-primary/10',
        )}
      >
        {value.map((reference, index) => (
          <div
            key={JSON.stringify(reference)}
            className="group relative h-12 w-12 overflow-hidden rounded border border-border bg-background"
          >
            <MediaThumb reference={reference} />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, at) => at !== index))}
              className="absolute right-0 top-0 hidden rounded-bl bg-black/70 p-0.5 group-hover:block"
              aria-label={t('generate.form.remove')}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {!full && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-12 w-12 items-center justify-center rounded border border-border text-muted-foreground hover:bg-secondary"
                aria-label={t('generate.form.pick')}
              >
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('generate.form.noMedia', { kind: t(`generate.media.${field.media}`) })}
                </p>
              ) : (
                <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto">
                  {candidates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      title={item.fileName}
                      onClick={() => add([{ media: item.id }])}
                      className="h-14 overflow-hidden rounded border border-border hover:border-primary"
                    >
                      <MediaThumb reference={{ media: item.id }} />
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
        {value.length === 0 && (
          <span className="text-[10px] text-muted-foreground">
            {t('generate.form.dropHere', { kind: t(`generate.media.${field.media}`) })}
          </span>
        )}
      </div>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  )
}

/** A list longer than this (a model's voices) is searched by typing, as VideoSOS 1's voice picker was. */
const SEARCHABLE_FROM = 12

function optionIndex(options: Array<{ value: unknown }>, value: unknown): string {
  const index = options.findIndex((option) => sameValue(option.value, value))
  return index === -1 ? '' : String(index)
}

interface FieldControlProps {
  field: Field
  value: unknown
  onChange: (value: unknown) => void
}

export function ModelFieldLabel({ field }: { field: Field }) {
  const { t } = useTranslation()
  const roleHints: Record<string, string> = {
    seed: t('generate.fieldHelp.seed'),
    prompt: t('generate.fieldHelp.prompt'),
    duration: t('generate.fieldHelp.duration'),
    voice: t('generate.fieldHelp.voice'),
    first_frame: t('generate.fieldHelp.firstFrame'),
    last_frame: t('generate.fieldHelp.lastFrame'),
    reference: t('generate.fieldHelp.reference'),
  }
  const hint = field.description?.trim() || roleHints[field.role ?? ''] || t('generate.fieldHelp.unspecified')
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span>{field.label}</span>
      {field.required && <span className="text-destructive">*</span>}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="nodrag shrink-0 rounded-full p-0.5 hover:text-foreground"
            aria-label={t('generate.fieldHelp.about', { field: field.label })}>
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-1.5 p-2 text-xs" align="start">
          <p className="whitespace-pre-wrap break-words">{hint}</p>
          {field.type === 'media' && <p>{t('generate.fieldHelp.fileCount', { min: field.min, max: field.max })}</p>}
          {(field.type === 'number' || field.type === 'integer') && field.min != null && <p>{t('generate.fieldHelp.minimum', { value: field.min })}</p>}
          {(field.type === 'number' || field.type === 'integer') && field.max != null && <p>{t('generate.fieldHelp.maximum', { value: field.max })}</p>}
          {field.default != null && typeof field.default !== 'object' && (
            <p>{t('generate.fieldHelp.defaultValue', {
              value: typeof field.default === 'boolean' ? t(field.default ? 'generate.fieldHelp.on' : 'generate.fieldHelp.off') : String(field.default),
            })}</p>
          )}
        </PopoverContent>
      </Popover>
    </span>
  )
}

export function FieldControl({ field, value, onChange }: FieldControlProps) {
  const { t } = useTranslation()
  const controlId = useId()
  const effective = value ?? field.default
  const label = <ModelFieldLabel field={field} />

  switch (field.type) {
    case 'textarea':
      return (
        <div className="space-y-1">
          {label}
          <Textarea
            aria-label={field.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={field.description ?? ''}
            data-testid={`generate-field-${field.key}`}
            className={cn('resize-y bg-secondary/30 text-xs', field.role === 'prompt' ? 'min-h-24' : 'min-h-14')}
          />
        </div>
      )
    case 'text':
      return (
        <div className="space-y-1">
          {label}
          <Input
            aria-label={field.label}
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder={typeof field.default === 'string' ? field.default : ''}
            className="h-7 text-xs"
          />
        </div>
      )
    case 'integer':
    case 'number':
      return (
        <div className="space-y-1">
          {label}
          <Input
            type="number"
            aria-label={field.label}
            value={typeof value === 'number' ? value : ''}
            min={field.min ?? undefined}
            max={field.max ?? undefined}
            step={field.type === 'integer' ? 1 : 'any'}
            placeholder={field.default !== undefined && field.default !== null ? String(field.default) : ''}
            onChange={(event) => {
              const text = event.target.value
              if (text === '') return onChange(undefined)
              const number = field.type === 'integer' ? Math.round(Number(text)) : Number(text)
              if (Number.isFinite(number)) onChange(number)
            }}
            className="h-7 text-xs"
          />
        </div>
      )
    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-2 py-0.5">
          {label}
          <Switch checked={effective === true} onCheckedChange={(checked) => onChange(checked)} aria-label={field.label} />
        </div>
      )
    case 'select':
    case 'size':
      if (field.options.length > SEARCHABLE_FROM) {
        return (
          <div className="space-y-1">
            {label}
            <Combobox
              id={controlId}
              value={optionIndex(field.options, effective)}
              options={field.options.map((option, index) => ({
                value: String(index),
                label: option.label,
                keywords: [String(option.value)],
              }))}
              onValueChange={(index) => onChange(field.options[Number(index)]?.value)}
              placeholder={t('generate.form.default')}
              searchPlaceholder={t('generate.form.searchOptions')}
              emptyMessage={t('generate.form.noOptions')}
              triggerClassName="h-7 px-2 text-xs"
            />
          </div>
        )
      }
      return (
        <div className="space-y-1">
          {label}
          <Select
            value={optionIndex(field.options, effective)}
            onValueChange={(index) => onChange(field.options[Number(index)]?.value)}
          >
            <SelectTrigger aria-label={field.label} className="h-7 text-xs" data-testid={`generate-field-${field.key}`}>
              <SelectValue placeholder={t('generate.form.default')} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {field.options.map((option, index) => (
                <SelectItem key={index} value={String(index)} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    case 'media':
      return (
        <div className="space-y-1">
          {label}
          <MediaSlot
            field={field}
            value={Array.isArray(value) ? (value as MediaRef[]) : value ? [value as MediaRef] : []}
            onChange={(next) => onChange(next.length ? next : undefined)}
          />
        </div>
      )
  }
}
