import { AutoModelForSequenceClassification, AutoTokenizer, env } from '@huggingface/transformers'
import { SCENE_RERANKER_MODEL_ID } from './types'

env.useBrowserCache = true
env.allowLocalModels = false

function loadModel(id: number) {
  return Promise.all([
    AutoTokenizer.from_pretrained(SCENE_RERANKER_MODEL_ID),
    AutoModelForSequenceClassification.from_pretrained(SCENE_RERANKER_MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: (event) => {
        if (event.status === 'progress' && event.file === 'onnx/model_quantized.onnx') {
          self.postMessage({ id, progress: Math.round(event.progress) })
        }
      },
    }),
  ])
}

let model: ReturnType<typeof loadModel> | undefined
let queue = Promise.resolve()
const pending = new Set<number>()

self.addEventListener('message', ({ data }: MessageEvent<
  { id: number; query: string; captions: string[] } | { id: number; cancel: true }
>) => {
  const { id } = data
  if ('cancel' in data) {
    pending.delete(id)
    return
  }

  pending.add(id)
  queue = queue.then(async () => {
    try {
      if (!pending.has(id)) return
      model ??= loadModel(id).catch((error) => {
        model = undefined
        throw error
      })
      const [tokenizer, classifier] = await model
      const scores: number[] = []
      // Bound peak memory and allow a superseded search to stop between batches.
      for (let start = 0; start < data.captions.length; start += 4) {
        if (!pending.has(id)) return
        const captions = data.captions.slice(start, start + 4)
        const inputs = tokenizer(captions.map(() => data.query), {
          text_pair: captions,
          padding: true,
          truncation: true,
          max_length: 256,
        })
        const { logits } = await classifier(inputs)
        scores.push(...Array.from(logits.data, Number))
      }
      if (pending.has(id)) self.postMessage({ id, scores })
    } catch (error) {
      if (pending.has(id)) self.postMessage({ id, error: String(error) })
    } finally {
      pending.delete(id)
    }
  })
})
