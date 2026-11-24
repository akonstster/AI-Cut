import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { Job } from '../services/generate-api'
import { JobCard } from './job-card'

vi.mock('../deps/studio', () => ({ ShareMenu: () => null }))
vi.mock('../services/timeline-actions', () => ({
  placeMediaAtPlayhead: vi.fn(),
  placeTextAtPlayhead: vi.fn(),
}))
vi.mock('./field-control', () => ({ OUTPUT_DRAG_TYPE: 'application/x-ai-cut-result' }))
vi.mock('./model-picker', () => ({ ProviderBadge: () => null }))

const JOB: Job = {
  id: 'job-1',
  project_id: null,
  provider: 'fal',
  model: 'fal-ai/flux',
  model_name: 'FLUX',
  task: 'image',
  values: { prompt: 'a cat on a windowsill' },
  status: 'done',
  progress: null,
  error: null,
  estimate: null,
  cost: null,
  cost_source: null,
  outputs: [
    { index: 0, kind: 'image', file: 'out.png', mime: 'image/png', size: 1 },
    {
      index: 1,
      kind: 'text',
      file: 'out.txt',
      mime: 'text/plain',
      size: 1,
      text: 'Rewritten prompt',
    },
  ],
  imported: [],
  place: false,
  origin: 'panel',
  created: 0,
  updated: 0,
}

describe('JobCard', () => {
  it('opens a picture large on a single click', async () => {
    const { container } = render(<JobCard job={JOB} onReuse={vi.fn()} />)

    fireEvent.click(container.querySelector('img')!)

    const large = await screen.findByRole('img', { name: 'out.png' })
    expect(large.getAttribute('src')).toBe('/api/jobs/job-1/files/0')
  })

  it('opens a written result large as well', () => {
    const { container } = render(<JobCard job={JOB} onReuse={vi.fn()} />)

    fireEvent.click(container.querySelector('p[title]')!)

    expect(document.querySelector('pre')?.textContent).toBe('Rewritten prompt')
  })

  it('leaves a video to play in place: its own double click is the full screen', () => {
    const video: Job = {
      ...JOB,
      outputs: [{ index: 0, kind: 'video', file: 'out.mp4', mime: 'video/mp4', size: 1 }],
    }
    const { container } = render(<JobCard job={video} onReuse={vi.fn()} />)

    const element = container.querySelector('video')!
    expect(element.hasAttribute('controls')).toBe(true)
    expect(element.getAttribute('title')).toBeNull()
    fireEvent.doubleClick(element)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })
})
