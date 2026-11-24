import { describe, expect, it } from 'vite-plus/test'
import { computeHotkeyListMaxHeight } from './hotkey-editor-layout'

describe('computeHotkeyListMaxHeight', () => {
  it('keeps the list inside the 98vh dialog on a tall screen', () => {
    // 900px window, 44px header + 392px keyboard preview.
    expect(computeHotkeyListMaxHeight(900, 436)).toBe(446)
  })

  it('gives a short window less than the 50vh cap so the last rows stay reachable', () => {
    // 50vh would be 350px here, but only 250px are left under the preview.
    expect(computeHotkeyListMaxHeight(700, 436)).toBe(250)
  })

  it('keeps a usable floor on a very short window', () => {
    expect(computeHotkeyListMaxHeight(480, 436)).toBe(120)
  })
})
