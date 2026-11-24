import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ExportCompleteView } from './export-complete-view'

const SAVED_PATH = 'D:\\Exports\\Clip.mp4'
const DEFAULT_PATH = 'C:\\Users\\me\\Documents\\Clip.mp4'

const baseProps = {
  mode: 'video' as const,
  previewUrl: null,
  isVideoResult: true,
  fileSize: 1024,
  elapsedSeconds: 3,
  onClose: () => {},
  onDownload: () => {},
  resultFile: () => null,
}

describe('ExportCompleteView', () => {
  it('offers the saved file and its folder instead of a download in the desktop window', () => {
    const onRevealSaved = vi.fn()
    const onOpenSaved = vi.fn()
    render(
      <ExportCompleteView
        {...baseProps}
        savedPath={SAVED_PATH}
        isDesktop
        onRevealSaved={onRevealSaved}
        onOpenSaved={onOpenSaved}
      />,
    )

    expect(screen.getByText(SAVED_PATH)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Open folder/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Open$/ }))
    expect(onRevealSaved).toHaveBeenCalledTimes(1)
    expect(onOpenSaved).toHaveBeenCalledTimes(1)
  })

  it('says the remembered folder was gone when the default folder was used', () => {
    render(<ExportCompleteView {...baseProps} savedPath={DEFAULT_PATH} savedFallback isDesktop />)

    expect(screen.getByText(/saved to the default folder/i)).toBeInTheDocument()
  })

  it('keeps the browser download when no file was written to disk', () => {
    render(<ExportCompleteView {...baseProps} />)

    expect(screen.getByRole('button', { name: /Download/i })).toBeInTheDocument()
  })
})
