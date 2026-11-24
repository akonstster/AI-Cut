import type { CaptionWord } from '@/types/timeline'

/**
 * The recognition words re-labelled with the edited text, keeping their timings. A correction like
 * "капучину" → "капучино" keeps the same word sequence, so word-by-word and karaoke still line up
 * with the speech. Undefined when the edit adds, removes or reorders words — those timings no longer
 * describe the text, and pretending they do would light the wrong words.
 */
function relabelCaptionWords(words: CaptionWord[], text: string): CaptionWord[] | undefined {
  if (words.length === 0) return undefined
  const normalized = text.trimStart().replace(/\s+$/, '')
  const pieces = normalized.match(/\s*\S+/g)
  if (!pieces || pieces.length !== words.length) return undefined
  const relabelled = words.map((word, index) => ({
    ...word,
    // The first word carries no leading space, the rest keep the separator before them.
    text: index === 0 ? pieces[index]!.trimStart() : pieces[index]!,
  }))
  return relabelled.map((word) => word.text).join('') === normalized ? relabelled : undefined
}

/** Word timings describe the recognized text; a text edit either re-labels them or drops them. */
export function editCaptionCue<
  T extends {
    text: string
    startSeconds: number
    endSeconds: number
    words?: CaptionWord[]
  },
>(cue: T, patch: Partial<Pick<T, 'text' | 'startSeconds' | 'endSeconds'>>): T {
  if (patch.text === undefined) {
    // Timing-only edits keep the words: the text still says what was spoken.
    return { ...cue, ...patch }
  }
  return { ...cue, ...patch, words: relabelCaptionWords(cue.words ?? [], patch.text) }
}
