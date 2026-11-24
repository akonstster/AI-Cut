import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/shared/logging/logger'
import {
  clearLocalModelCache,
  inspectAllLocalModelCaches,
  supportsLocalModelCacheInspection,
  type LocalModelCacheSummary,
} from '@/shared/utils/local-model-cache'
import { cn } from '@/shared/ui/cn'
import { formatBytes } from '@/shared/utils/format-utils'

const log = createLogger('LocalModelCacheControl')

interface LocalModelCacheControlProps {
  className?: string
  prepare?: (
    id: LocalModelCacheSummary['id'],
    onProgress: (percent: number) => void,
  ) => Promise<void>
}

export function LocalModelCacheControl({ className, prepare }: LocalModelCacheControlProps) {
  const { t } = useTranslation()
  const [cacheSummaries, setCacheSummaries] = useState<LocalModelCacheSummary[]>([])
  const [preparingId, setPreparingId] = useState<LocalModelCacheSummary['id']>()
  const [preparePercent, setPreparePercent] = useState<number>()
  const [prepareError, setPrepareError] = useState<string>()
  const [preparedId, setPreparedId] = useState<LocalModelCacheSummary['id']>()
  const [isLoading, setIsLoading] = useState(true)
  const [clearingCacheId, setClearingCacheId] = useState<LocalModelCacheSummary['id'] | null>(null)
  const [clearedCacheId, setClearedCacheId] = useState<LocalModelCacheSummary['id'] | null>(null)
  const resetTimerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const inspectionSupported = supportsLocalModelCacheInspection()

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current)
      }
    }
  }, [])

  const refreshCacheSummaries = useCallback(async () => {
    if (!inspectionSupported) {
      if (mountedRef.current) {
        setCacheSummaries([])
        setIsLoading(false)
      }
      return
    }

    if (mountedRef.current) {
      setIsLoading(true)
    }

    try {
      const nextSummaries = await inspectAllLocalModelCaches()
      if (!mountedRef.current) return
      setCacheSummaries(nextSummaries)
    } catch (error) {
      log.error('Failed to inspect local model cache state', error)
      if (mountedRef.current) {
        toast.error(t('projects.settings.modelCache.inspectFailed'))
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [inspectionSupported, t])

  useEffect(() => {
    void refreshCacheSummaries()
  }, [refreshCacheSummaries])

  const scheduleReset = useCallback((cacheId: LocalModelCacheSummary['id']) => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      setClearedCacheId(null)
    }

    setClearedCacheId(cacheId)
    resetTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) {
        setClearedCacheId(null)
      }
      resetTimerRef.current = null
    }, 2000)
  }, [])

  const handlePrepare = async (summary: LocalModelCacheSummary) => {
    if (!prepare || preparingId || clearingCacheId) return
    setPreparingId(summary.id)
    setPreparePercent(undefined)
    setPrepareError(undefined)
    setPreparedId(undefined)
    try {
      await prepare(summary.id, (percent) => {
        if (mountedRef.current) setPreparePercent(percent)
      })
      if (mountedRef.current) setPreparedId(summary.id)
    } catch (error) {
      if (mountedRef.current)
        setPrepareError(error instanceof Error ? error.message : String(error))
    } finally {
      await refreshCacheSummaries()
      if (mountedRef.current) setPreparingId(undefined)
    }
  }

  const handleClear = useCallback(
    async (summary: LocalModelCacheSummary) => {
      setClearingCacheId(summary.id)
      setPreparedId(undefined)

      try {
        const deleted = await clearLocalModelCache(summary)
        await refreshCacheSummaries()
        scheduleReset(summary.id)
        toast.success(
          deleted
            ? t('projects.settings.modelCache.clearedToast', { label: summary.label })
            : t('projects.settings.modelCache.alreadyEmptyToast', { label: summary.label }),
        )
      } catch (error) {
        log.error(`Failed to clear local model cache ${summary.id}`, error)
        toast.error(t('projects.settings.modelCache.clearFailed', { label: summary.label }))
      } finally {
        if (mountedRef.current) {
          setClearingCacheId(null)
        }
      }
    },
    [refreshCacheSummaries, scheduleReset, t],
  )

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {t(
              prepare
                ? 'projects.settings.modelCache.manageTitle'
                : 'projects.settings.modelCache.title',
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(
              prepare
                ? 'projects.settings.modelCache.manageDescription'
                : 'projects.settings.modelCache.description',
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-28 shrink-0 gap-1.5"
          onClick={() => {
            void refreshCacheSummaries()
          }}
          disabled={!inspectionSupported || isLoading}
        >
          <RotateCcw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          {isLoading
            ? t('projects.settings.modelCache.checking')
            : t('projects.settings.modelCache.refresh')}
        </Button>
      </div>

      {!inspectionSupported && (
        <p className="text-xs text-muted-foreground">
          {t('projects.settings.modelCache.inspectionUnavailable')}
        </p>
      )}

      {prepareError && (
        <p role="alert" className="break-words text-xs text-destructive">
          {prepareError}
        </p>
      )}
      {inspectionSupported &&
        cacheSummaries.map((summary) => {
          const isClearing = clearingCacheId === summary.id
          const isCleared = clearedCacheId === summary.id
          const sizeLabel =
            summary.inspectionState === 'timed-out'
              ? t('projects.settings.modelCache.unavailable')
              : summary.inspectionState === 'error'
                ? t('projects.settings.modelCache.unavailable')
                : !summary.downloaded
                  ? '0 B'
                  : summary.sizeStatus === 'exact' || summary.sizeStatus === 'partial'
                    ? t('projects.settings.modelCache.approxSize', {
                        size: formatBytes(summary.totalBytes),
                      })
                    : t('projects.settings.modelCache.unavailable')

          return (
            <div
              key={summary.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 text-sm">
                <span className="truncate font-medium">{summary.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{sizeLabel}</span>
                {prepare && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`projects.settings.modelCache.purpose.${summary.id}`)}
                  </p>
                )}
                {preparingId === summary.id && preparePercent !== undefined && (
                  <progress
                    className="mt-1 w-full"
                    max={100}
                    value={preparePercent}
                    aria-label={t('projects.settings.modelCache.preparing')}
                  />
                )}
                {preparedId === summary.id && (
                  <p role="status" className="mt-1 text-xs text-emerald-400">
                    {t('projects.settings.modelCache.prepared')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {prepare && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!preparingId || !!clearingCacheId}
                    onClick={() => void handlePrepare(summary)}
                  >
                    {t(
                      preparingId === summary.id
                        ? 'projects.settings.modelCache.preparing'
                        : summary.downloaded
                          ? 'projects.settings.modelCache.prepare'
                          : 'projects.settings.modelCache.install',
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-28 shrink-0 gap-1.5"
                  onClick={() => {
                    void handleClear(summary)
                  }}
                  disabled={!!clearingCacheId || !!preparingId || (prepare && !summary.downloaded)}
                >
                  {isClearing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isCleared && !isClearing && <Check className="h-3.5 w-3.5" />}
                  {!isClearing && !isCleared && <Trash2 className="h-3.5 w-3.5" />}
                  {isClearing
                    ? t('common.clearing')
                    : isCleared
                      ? t('projects.settings.modelCache.cleared')
                      : t(
                          prepare
                            ? 'projects.settings.modelCache.removeFiles'
                            : 'projects.settings.modelCache.clear',
                        )}
                </Button>
              </div>
            </div>
          )
        })}
    </div>
  )
}
