import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Eye, Pencil, Plus, UsersRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useMediaLibraryStore } from '../deps/editor'
import type { Field, MediaRef } from '../services/generate-api'
import { useProjectElements } from '../hooks/use-project-elements'
import { removeProjectElement, saveProjectElement } from '../services/project-elements'
import { MediaThumb } from './field-control'

const NAME = /^[\p{L}\p{N}_-]+$/u

/** Every picture the form holds, in its picture slots' order: what a new element is made of. */
function picturesOf(fields: Field[], values: Record<string, unknown>): MediaRef[] {
  return fields.flatMap((field) => {
    if (field.type !== 'media' || field.media !== 'image') return []
    const value = values[field.key]
    return (Array.isArray(value) ? value : value ? [value] : []) as MediaRef[]
  })
}

function refKey(ref: MediaRef) {
  return JSON.stringify(ref)
}

export function PromptElements({
  projectId,
  fields,
  values,
  onMention,
}: {
  projectId: string | null
  fields: Field[]
  values: Record<string, unknown>
  onMention?: (name: string) => void
}) {
  const { t } = useTranslation()
  const { elements, ready, error: loadError } = useProjectElements(projectId)
  const media = useMediaLibraryStore((state) => state.mediaItems)
  const mediaProject = useMediaLibraryStore((state) => state.currentProjectId)
  const [saving, setSaving] = useState(false)
  const [writeError, setWriteError] = useState<string>()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string>()
  const [name, setName] = useState('')
  const [refs, setRefs] = useState<MediaRef[]>([])
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<MediaRef>()
  const projectMedia = mediaProject === projectId ? media : []
  const images = projectMedia.filter(
    (item) =>
      item.mimeType.startsWith('image/') &&
      item.fileName.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const nameKey = name.trim().toLowerCase()
  const duplicate = elements.some(
    (element) => element.name !== editing && element.name.toLowerCase() === nameKey,
  )
  const valid = NAME.test(name.trim()) && !duplicate

  const reset = (original?: string, pictures: MediaRef[] = []) => {
    setEditing(original)
    setName(original ?? '')
    setRefs([...new Map(pictures.map((ref) => [refKey(ref), ref])).values()])
    setPreview(undefined)
  }

  const toggle = (ref: MediaRef) => {
    setRefs((current) =>
      current.some((each) => refKey(each) === refKey(ref))
        ? current.filter((each) => refKey(each) !== refKey(ref))
        : [...current, ref],
    )
    setPreview(ref)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!projectId}
        onClick={() => {
          reset(
            undefined,
            picturesOf(fields, values).filter(
              (ref) =>
                typeof ref === 'object' &&
                ref !== null &&
                'media' in ref &&
                projectMedia.some((item) => item.id === ref.media),
            ),
          )
          setSearch('')
          setWriteError(undefined)
          setOpen(true)
        }}
      >
        <UsersRound className="mr-1 h-4 w-4" />
        {t('generate.elements.button')}
      </Button>
      <DialogContent className="max-h-[90dvh] max-w-5xl overflow-y-auto">
        <DialogTitle>{t('generate.elements.button')}</DialogTitle>
        <DialogDescription>{t('generate.elements.visualHint')}</DialogDescription>
        {!ready && (
          <p role="status" className="text-xs">
            {loadError ?? t('generate.form.loading')}
          </p>
        )}
        {writeError && (
          <p role="alert" className="text-xs text-destructive">
            {writeError}
          </p>
        )}
        <div className="grid min-w-0 gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
          <section className="min-w-0 space-y-2">
            <Button type="button" variant="outline" onClick={() => reset()}>
              <Plus className="mr-1 h-4 w-4" />
              {t('generate.elements.new')}
            </Button>
            {ready && elements.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('generate.elements.empty')}</p>
            )}
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {elements.map((element) => (
                <li key={element.name} className="flex items-center gap-1 rounded border p-1">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-pressed={editing === element.name}
                    onClick={() => reset(element.name, element.refs)}
                  >
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                      {element.refs[0] && <MediaThumb reference={element.refs[0]} />}
                    </span>
                    <span className="truncate text-sm">@{element.name}</span>
                    <Pencil className="ml-auto h-3 w-3 shrink-0" />
                  </button>
                  {onMention && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('generate.elements.use', { name: element.name })}
                      onClick={() => {
                        onMention(element.name)
                        setOpen(false)
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <form
            className="min-w-0 space-y-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!projectId || !ready || saving || !valid || refs.length === 0) return
              setSaving(true)
              setWriteError(undefined)
              try {
                await saveProjectElement(projectId, { name: name.trim(), refs }, editing)
                reset(name.trim(), refs)
              } catch (error) {
                setWriteError(String(error))
              } finally {
                setSaving(false)
              }
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('generate.elements.name')}
              aria-label={t('generate.elements.name')}
              aria-invalid={name.trim() !== '' && !valid}
            />
            {duplicate && (
              <p className="text-xs text-destructive">{t('generate.elements.duplicate')}</p>
            )}
            {!duplicate && name.trim() && !valid && (
              <p className="text-xs text-destructive">{t('generate.elements.badName')}</p>
            )}
            {editing && editing !== name.trim() && (
              <p className="text-xs text-muted-foreground">{t('generate.elements.renameHint')}</p>
            )}
            {preview && (
              <div className="h-52 overflow-hidden rounded bg-muted">
                <MediaThumb key={refKey(preview)} reference={preview} full />
              </div>
            )}
            <div
              className="flex flex-wrap gap-2"
              aria-label={t('generate.elements.pictures', { count: refs.length })}
            >
              {refs.map((ref, index) => (
                <div
                  key={refKey(ref)}
                  className="relative h-16 w-20 overflow-hidden rounded bg-muted"
                >
                  <button
                    type="button"
                    className="block h-full w-full"
                    onClick={() => setPreview(ref)}
                    aria-label={t('generate.elements.preview', { number: index + 1 })}
                  >
                    <MediaThumb reference={ref} />
                  </button>
                  <button
                    type="button"
                    className="absolute right-0 top-0 rounded bg-background p-1"
                    onClick={() => toggle(ref)}
                    aria-label={t('generate.elements.removePicture', { number: index + 1 })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('generate.elements.search')}
              aria-label={t('generate.elements.search')}
            />
            <div
              className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4"
              aria-label={t('generate.elements.library')}
            >
              {images.map((item) => {
                const ref: MediaRef = { media: item.id }
                const selected = refs.some((each) => refKey(each) === refKey(ref))
                return (
                  <div
                    key={item.id}
                    className={`relative min-w-0 overflow-hidden rounded border ${selected ? 'border-primary' : 'border-border'}`}
                  >
                    <button
                      type="button"
                      className="block w-full text-left"
                      aria-pressed={selected}
                      title={item.fileName}
                      onClick={() => toggle(ref)}
                    >
                      <span className="block aspect-video bg-muted">
                        <MediaThumb reference={ref} />
                      </span>
                      <span className="block truncate px-1 py-0.5 text-xs">{item.fileName}</span>
                      {selected && (
                        <Check className="absolute left-1 top-1 h-5 w-5 rounded bg-primary p-0.5 text-primary-foreground" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded bg-background p-1"
                      onClick={() => setPreview(ref)}
                      aria-label={`${t('generate.elements.previewImage')}: ${item.fileName}`}
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
            {images.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('generate.elements.noMatches')}</p>
            )}
            <div className="flex justify-between gap-2">
              <Button type="submit" disabled={!ready || saving || !valid || refs.length === 0}>
                {t('generate.elements.keep')}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={async () => {
                    if (!projectId) return
                    setSaving(true)
                    setWriteError(undefined)
                    try {
                      await removeProjectElement(projectId, editing)
                      reset()
                    } catch (error) {
                      setWriteError(String(error))
                    } finally {
                      setSaving(false)
                    }
                  }}
                >
                  {t('generate.elements.remove', { name: editing })}
                </Button>
              )}
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
