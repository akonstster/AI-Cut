import { describe, expect, it } from 'vite-plus/test'
import { editCaptionCue } from './edit-caption-cue'
import { revealCaption } from './caption-reveal'

describe('manual caption editing', () => {
  it('re-labels the recognition words so karaoke keeps the corrected text and its timings', () => {
    const original = {
      text: 'один капучину.',
      startSeconds: 1.38,
      endSeconds: 2.2,
      words: [
        { text: 'один', startSeconds: 1.38, endSeconds: 1.52 },
        { text: ' капучину.', startSeconds: 1.52, endSeconds: 2.2 },
      ],
    }
    const edited = editCaptionCue(original, { text: 'один капучино.' })

    expect(edited.text).toBe('один капучино.')
    expect(edited.words?.map((word) => word.text)).toEqual(['один', ' капучино.'])
    expect(edited.words?.[1]?.startSeconds).toBe(1.52)
    const revealed = revealCaption(edited, 1.6, 'karaoke', '#fff', '#ff0')
    expect(revealed?.text).toBe('один капучино.')
    expect(original.words?.[1]?.text).toBe(' капучину.')
  })

  it('drops the words when the edit adds or removes words', () => {
    const original = {
      text: 'один капучину.',
      startSeconds: 0,
      endSeconds: 2,
      words: [{ text: 'один капучину.', startSeconds: 0, endSeconds: 2 }],
    }

    expect(editCaptionCue(original, { text: 'один большой капучино.' }).words).toBeUndefined()
  })

  it('keeps the words when only the cue timing changes', () => {
    const original = {
      text: 'один капучину.',
      startSeconds: 0,
      endSeconds: 2,
      words: [
        { text: 'один', startSeconds: 0, endSeconds: 0.5 },
        { text: ' капучину.', startSeconds: 0.5, endSeconds: 2 },
      ],
    }
    const edited = editCaptionCue(original, { startSeconds: 0.2, endSeconds: 2.4 })

    expect(edited.words).toHaveLength(2)
    expect(edited.startSeconds).toBe(0.2)
  })
})
