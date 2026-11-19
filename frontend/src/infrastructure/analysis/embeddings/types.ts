/**
 * Public types for the sentence-embedding provider.
 *
 * The model identifier and dimension are exposed so consumers can persist
 * them alongside stored embeddings and detect mismatch on load (e.g. if
 * we switch to a larger model later, old vectors must be re-generated).
 */

export const EMBEDDING_MODEL_ID = 'Xenova/multilingual-e5-small'
export const EMBEDDING_MODEL_DIM = 384
export const SCENE_RERANKER_MODEL_ID = 'onnx-community/bge-reranker-v2-m3-ONNX'

export interface EmbeddingsProgress {
  stage: 'loading-model' | 'idle'
  percent: number
}

export interface EmbeddingsOptions {
  onProgress?: (progress: EmbeddingsProgress) => void
  signal?: AbortSignal
}

export interface EmbeddingsProvider {
  /** Ensures the model is loaded; safe to call repeatedly. */
  ensureReady(options?: EmbeddingsOptions): Promise<void>
  /** Embed one text. Returns a unit-length 384-dim vector. */
  embed(text: string, options?: EmbeddingsOptions): Promise<Float32Array>
  /** Embed a batch. More efficient than calling `embed` in a loop. */
  embedBatch(texts: string[], options?: EmbeddingsOptions): Promise<Float32Array[]>
  /** Release the worker and free the underlying model memory. */
  dispose(): void
}
