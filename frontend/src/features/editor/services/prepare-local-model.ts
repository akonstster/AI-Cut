import type { LocalModelCacheId } from '@/shared/utils/local-model-cache'

const IDLE_MS = 180_000

function prepareWorker(
  worker: Worker,
  init: Record<string, unknown>,
  progress: (percent: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const finish = (error?: Error) => {
      clearTimeout(timer)
      worker.terminate()
      if (error) reject(error)
      else resolve()
    }
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(() => finish(new Error('Local model preparation timed out')), IDLE_MS)
    }
    worker.onerror = (event) =>
      finish(new Error(event.message || 'Local model worker failed to start'))
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') finish()
      else if (data.type === 'error')
        finish(new Error(data.message || 'Local model failed to start'))
      else if (data.type === 'progress') {
        resetTimer()
        const percent = data.percent ?? data.event?.progress
        if (typeof percent === 'number' && Number.isFinite(percent))
          progress(Math.min(99, Math.max(0, percent)))
      }
    }
    resetTimer()
    try {
      worker.postMessage(init)
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export async function prepareLocalModel(
  id: LocalModelCacheId,
  progress: (percent: number) => void,
): Promise<void> {
  switch (id) {
    case 'lfm': {
      const { createLfmSceneWorker } = await import('@/infrastructure/analysis/create-lfm-worker')
      return prepareWorker(createLfmSceneWorker(), { type: 'init' }, progress)
    }
    case 'gemma': {
      const { createGemmaSceneWorker } =
        await import('@/infrastructure/analysis/create-gemma-worker')
      return prepareWorker(createGemmaSceneWorker(), { type: 'init' }, progress)
    }
    case 'clip': {
      const { clipProvider } = await import('@/infrastructure/analysis/embeddings/clip-provider')
      return clipProvider.ensureReady({ onProgress: ({ percent }) => progress(percent) })
    }
    case 'multilingual-e5': {
      const { embeddingsProvider } =
        await import('@/infrastructure/analysis/embeddings/embeddings-provider')
      return embeddingsProvider.ensureReady({ onProgress: ({ percent }) => progress(percent) })
    }
    case 'scene-reranker': {
      const { rerankSceneCaptions } =
        await import('@/infrastructure/analysis/embeddings/scene-reranker')
      await rerankSceneCaptions('test', ['test'], { onProgress: progress })
      return
    }
    case 'whisper':
    case 'parakeet': {
      const { createTranscriptionWorker } =
        await import('@/features/media-library/transcription/lib/transcription-worker-pool')
      const { MODEL_IDS } = await import('@/features/media-library/transcription/types')
      const modelId = MODEL_IDS[id === 'whisper' ? 'whisper-large' : 'parakeet-tdt-v3']
      return prepareWorker(createTranscriptionWorker(id), { type: 'init', modelId }, progress)
    }
    case 'musicgen-small': {
      const { musicgenService } = await import('./musicgen-service')
      return musicgenService.prepare(id)
    }
    case 'kokoro-tts': {
      const { kokoroTtsService, KOKORO_TTS_BEST_MODEL } = await import('./kokoro-tts-service')
      return kokoroTtsService.prepare(KOKORO_TTS_BEST_MODEL)
    }
    case 'supertonic-tts': {
      const { supertonicTtsService } = await import('./supertonic-tts-service')
      return supertonicTtsService.prepare()
    }
    case 'rife': {
      const { RifeInterpolator } = await import('@/infrastructure/interpolation')
      const model = new RifeInterpolator({
        onDownloadProgress: ({ receivedBytes, totalBytes }) => {
          if (totalBytes > 0) progress(Math.min(99, (receivedBytes / totalBytes) * 100))
        },
      })
      return model.ready()
    }
  }
}
