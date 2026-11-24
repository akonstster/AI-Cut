import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { Job, OutputFile } from '../services/generate-api'
import { ResultPreviewDialog } from './result-preview-dialog'

const JOB = { id: 'job-1' } as unknown as Job

function output(overrides: Partial<OutputFile>): OutputFile {
  return { index: 0, kind: 'image', file: 'out.png', mime: 'image/png', size: 1, ...overrides }
}

describe('ResultPreviewDialog', () => {
  it('opens the generated picture at full size and closes on Escape', () => {
    const onClose = vi.fn()
    render(<ResultPreviewDialog job={JOB} output={output({})} onClose={onClose} />)

    const image = screen.getByRole('img', { name: 'out.png' })
    expect(image.getAttribute('src')).toBe('/api/jobs/job-1/files/0')
    fireEvent.keyDown(image, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('plays a generated sound with controls', () => {
    render(
      <ResultPreviewDialog
        job={JOB}
        output={output({ kind: 'audio', file: 'out.mp3', mime: 'audio/mpeg' })}
        onClose={vi.fn()}
      />,
    )

    const audio = screen.getByLabelText('out.mp3', { selector: 'audio' })
    expect(audio.hasAttribute('controls')).toBe(true)
    expect(audio.getAttribute('src')).toBe('/api/jobs/job-1/files/0')
  })

  it('shows written results in full', () => {
    render(
      <ResultPreviewDialog
        job={JOB}
        output={output({
          kind: 'text',
          file: 'out.txt',
          mime: 'text/plain',
          text: 'A whole script',
        })}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('A whole script')).toBeTruthy()
  })

  it('says so when the file cannot be shown', () => {
    render(<ResultPreviewDialog job={JOB} output={output({})} onClose={vi.fn()} />)

    fireEvent.error(screen.getByRole('img', { name: 'out.png' }))
    expect(screen.getByRole('status').textContent).toContain('could not be opened')
  })
})
