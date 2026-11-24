import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ColorGradingDock } from './color-grading-dock'

vi.mock('../hooks/use-color-playhead-auto-select', () => ({
  useColorPlayheadAutoSelect: () => undefined,
}))

vi.mock('./properties-sidebar/color-grade-panel', () => ({
  ColorGradePanel: ({
    layout,
    keyframesLaneOpen,
  }: {
    layout?: string
    keyframesLaneOpen?: boolean
  }) => (
    <div
      data-testid="color-grade-panel"
      data-layout={layout}
      data-keyframes-lane={String(keyframesLaneOpen ?? false)}
    />
  ),
}))

describe('ColorGradingDock', () => {
  it('starts with the keyframe lane closed and toggles it from the header', () => {
    render(<ColorGradingDock />)

    const panel = screen.getByTestId('color-grade-panel')
    expect(panel).toHaveAttribute('data-layout', 'dock')
    expect(panel).toHaveAttribute('data-keyframes-lane', 'false')

    const toggle = screen.getByTestId('color-keyframes-toggle')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('color-grade-panel')).toHaveAttribute('data-keyframes-lane', 'true')
  })
})
