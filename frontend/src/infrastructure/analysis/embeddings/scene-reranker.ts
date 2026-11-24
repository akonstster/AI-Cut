import RerankerWorker from './scene-reranker-worker.ts?worker'

let worker: Worker | undefined
let nextId = 0

export async function rerankSceneCaptions(
  query: string,
  captions: string[],
  options: { signal?: AbortSignal; onProgress?: (percent: number) => void } = {},
): Promise<number[]> {
  const { signal, onProgress } = options
  signal?.throwIfAborted()
  const activeWorker = (worker ??= new RerankerWorker())
  const id = ++nextId

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => cancel(new Error('Scene reranker timed out')), 300_000)
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      activeWorker.removeEventListener('message', receive)
      activeWorker.removeEventListener('error', fail)
    }
    const cancel = (error: unknown) => {
      cleanup()
      activeWorker.postMessage({ id, cancel: true })
      reject(error)
    }
    const abort = () => cancel(signal?.reason)
    const fail = (event: ErrorEvent) => {
      cleanup()
      activeWorker.terminate()
      if (worker === activeWorker) worker = undefined
      reject(new Error(event.message))
    }
    const receive = ({ data }: MessageEvent) => {
      if (data.id !== id) return
      if (typeof data.progress === 'number') {
        onProgress?.(data.progress)
        return
      }
      cleanup()
      if (data.error) reject(new Error(data.error))
      else resolve(data.scores)
    }
    signal?.addEventListener('abort', abort, { once: true })
    activeWorker.addEventListener('message', receive)
    activeWorker.addEventListener('error', fail)
    activeWorker.postMessage({ id, query, captions })
  })
}
