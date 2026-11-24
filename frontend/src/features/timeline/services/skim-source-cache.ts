/**
 * Resolved audio sources for timeline skimming, shared by every skim consumer.
 *
 * A skim frame needs the media id resolved to a playable URL (a conform WAV when
 * one exists, otherwise a blob URL read from the workspace). That resolution used
 * to live in a `useRef` inside the skim hook, so it died with the component: every
 * return to the page, and every extra skim surface, resolved — and read — the same
 * media again. Keeping it here means one resolution per media per session.
 */

export interface SkimAudioSource {
  mediaUrl: string
  mediaKind: 'audio' | 'video'
}

/** Plenty for a project's clips; older entries fall out first. */
const MAX_CACHED_SOURCES = 64

const sources = new Map<string, SkimAudioSource>()
const pendingResolutions = new Map<string, Promise<SkimAudioSource | null>>()

export function getCachedSkimSource(mediaId: string): SkimAudioSource | undefined {
  return sources.get(mediaId)
}

export function cacheSkimSource(mediaId: string, source: SkimAudioSource): void {
  if (!sources.has(mediaId)) {
    while (sources.size >= MAX_CACHED_SOURCES) {
      const oldest = sources.keys().next().value
      if (oldest === undefined) break
      sources.delete(oldest)
    }
  }
  sources.set(mediaId, source)
}

/**
 * Resolve a media id once: a cached source answers immediately, and concurrent
 * callers share the in-flight resolution instead of each reading the workspace.
 * Failures are not cached, so a transient read error can be retried.
 */
export function resolveSkimSourceOnce(
  mediaId: string,
  resolve: () => Promise<SkimAudioSource | null>,
): Promise<SkimAudioSource | null> {
  const cached = sources.get(mediaId)
  if (cached) return Promise.resolve(cached)

  const pending = pendingResolutions.get(mediaId)
  if (pending) return pending

  const promise = resolve()
    .then((source) => {
      if (source) cacheSkimSource(mediaId, source)
      return source
    })
    .finally(() => {
      if (pendingResolutions.get(mediaId) === promise) pendingResolutions.delete(mediaId)
    })

  pendingResolutions.set(mediaId, promise)
  return promise
}

/** Drop every resolved source (workspace switch, tests). */
export function clearSkimSourceCache(): void {
  sources.clear()
  pendingResolutions.clear()
}
