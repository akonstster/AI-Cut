import { describe, expect, it, vi } from 'vite-plus/test'
import { clearSkimSourceCache, resolveSkimSourceOnce } from './skim-source-cache'

const source = { mediaUrl: 'blob:media', mediaKind: 'audio' as const }

describe('resolveSkimSourceOnce', () => {
  it('resolves a media once and answers later calls from the cache', async () => {
    clearSkimSourceCache()
    const resolve = vi.fn(async () => source)

    expect(await resolveSkimSourceOnce('m1', resolve)).toEqual(source)
    expect(await resolveSkimSourceOnce('m1', resolve)).toEqual(source)
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight resolution between concurrent callers', async () => {
    clearSkimSourceCache()
    const resolve = vi.fn(async () => source)

    const results = await Promise.all([
      resolveSkimSourceOnce('m2', resolve),
      resolveSkimSourceOnce('m2', resolve),
      resolveSkimSourceOnce('m2', resolve),
    ])

    expect(results).toEqual([source, source, source])
    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure, so the next call retries', async () => {
    clearSkimSourceCache()
    const failing = vi.fn(async () => null)
    const succeeding = vi.fn(async () => source)

    expect(await resolveSkimSourceOnce('m3', failing)).toBeNull()
    expect(await resolveSkimSourceOnce('m3', succeeding)).toEqual(source)
    expect(failing).toHaveBeenCalledTimes(1)
    expect(succeeding).toHaveBeenCalledTimes(1)
  })
})
