import { describe, expect, it } from 'vitest'
import type { Field } from './generate-api'
import { videoGeometry } from './video-geometry'
import { shotValues } from './storyboard'

const select = (key: string, options: string[]): Field => ({
  key,
  label: key,
  type: 'select',
  default: options[0],
  advanced: false,
  required: false,
  options: options.map((value) => ({ value, label: value })),
})
const fields = [
  select('aspect_ratio', ['16:9', '9:16']),
  select('resolution', ['480p', '720p']),
  select('size', ['854x480', '480x854', '720x1280']),
]

describe('generation geometry', () => {
  it('replaces a stale landscape size with a portrait size', () => {
    const { values } = videoGeometry(fields, { size: '854x480' }, '9:16')
    expect(values).toEqual({ size: '480x854', aspect_ratio: '9:16' })
  })

  it('updates the aspect and resolution from a selected exact size', () => {
    const { values } = videoGeometry(fields, { size: '720x1280' }, '16:9', 'size')
    expect(values).toEqual({ size: '720x1280', aspect_ratio: '9:16', resolution: '720p' })
  })

  it('sends shot artwork only in the reference slot when first frame is unset', () => {
    const ref = { media: 'artwork' }
    const inputs: Field[] = (['first_frame', 'last_frame', 'reference'] as const).map((role) => ({
      type: 'media',
      media: 'image',
      label: role,
      key: role,
      role,
      min: 0,
      max: 3,
      list: true,
      required: false,
      advanced: false,
    }))
    expect(shotValues(inputs, { prompt: 'Scene', references: [ref] })).toEqual({ reference: [ref] })
    const firstFrame = { media: 'opening' }
    expect(shotValues(inputs, { prompt: 'Scene', firstFrame, references: [ref] })).toEqual({
      first_frame: [firstFrame],
      reference: [ref],
    })
  })
})
