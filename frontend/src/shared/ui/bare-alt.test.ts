import { describe, expect, it } from 'vite-plus/test'
import { isBareAltPress } from './bare-alt'

function key(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: 'a',
    code: 'KeyA',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent
}

describe('isBareAltPress', () => {
  it('recognises Alt on its own, by key and by code', () => {
    expect(isBareAltPress(key({ key: 'Alt', code: 'AltLeft' }))).toBe(true)
    expect(isBareAltPress(key({ key: 'Alt', code: 'AltRight' }))).toBe(true)
  })

  it('leaves Alt combinations to the editor', () => {
    expect(isBareAltPress(key({ key: '1', code: 'Digit1' }))).toBe(false)
    expect(isBareAltPress(key({ key: 'Alt', code: 'AltLeft', ctrlKey: true }))).toBe(false)
    expect(isBareAltPress(key({ key: 'Alt', code: 'AltLeft', shiftKey: true }))).toBe(false)
    expect(isBareAltPress(key({ key: 'Alt', code: 'AltLeft', metaKey: true }))).toBe(false)
  })
})
