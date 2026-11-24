import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { ExportDestinationFields } from './export-destination-fields'

const EXPORTS_DIR = 'D:\\Exports'
const DOCUMENTS_DIR = 'C:\\Users\\me\\Documents'

describe('ExportDestinationFields', () => {
  it('shows the remembered folder and file name', () => {
    render(
      <ExportDestinationFields
        dir={EXPORTS_DIR}
        defaultDir={null}
        fileName="Мой клип"
        onChooseDir={() => {}}
        onFileNameChange={() => {}}
      />,
    )

    expect(screen.getByText(EXPORTS_DIR)).toBeInTheDocument()
    expect(screen.getByLabelText('File name')).toHaveValue('Мой клип')
  })

  it('shows the default folder until one is chosen', () => {
    render(
      <ExportDestinationFields
        dir=""
        defaultDir={DOCUMENTS_DIR}
        fileName="Clip"
        onChooseDir={() => {}}
        onFileNameChange={() => {}}
      />,
    )

    expect(screen.getByText(DOCUMENTS_DIR)).toBeInTheDocument()
  })

  it('reports a chosen folder and a typed name', () => {
    const onChooseDir = vi.fn()
    const onFileNameChange = vi.fn()
    render(
      <ExportDestinationFields
        dir=""
        defaultDir={null}
        fileName=""
        onChooseDir={onChooseDir}
        onFileNameChange={onFileNameChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Choose/i }))
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'Final' } })

    expect(onChooseDir).toHaveBeenCalledTimes(1)
    expect(onFileNameChange).toHaveBeenCalledWith('Final')
  })
})
