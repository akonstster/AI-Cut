import type { Field } from './generate-api'

function dimensions(value: unknown): [number, number] | undefined {
  const match = typeof value === 'string' && /^(\d+)\s*[x×]\s*(\d+)$/i.exec(value)
  if (!match) return undefined
  const width = Number(match[1])
  const height = Number(match[2])
  if (width > 0 && height > 0) return [width, height]
}

function aspectRatio(value: unknown): number | undefined {
  const match = typeof value === 'string' && /^(\d+):(\d+)$/.exec(value)
  if (!match || Number(match[2]) === 0) return undefined
  return Number(match[1]) / Number(match[2])
}

function resolutionPixels(value: unknown): number | undefined {
  const match = typeof value === 'string' && /^(\d+)p?$/i.exec(value)
  return match ? Number(match[1]) : undefined
}

export function videoGeometry(
  fields: Field[],
  values: Record<string, unknown>,
  projectAspect?: string,
  changed?: string,
) {
  const aspect = fields.find((field) => field.key === 'aspect_ratio')
  const resolution = fields.find((field) => field.key === 'resolution')
  const size = fields.find((field) => field.key === 'size')
  const next = { ...values }
  if (
    aspect?.type === 'select' &&
    next.aspect_ratio == null &&
    aspect.options.some((option) => option.value === projectAspect)
  ) {
    next.aspect_ratio = projectAspect
  }
  if (size?.type !== 'select' || !size.options.some((option) => dimensions(option.value)))
    return { fields, values: next }
  const ratios = aspect?.type === 'select' ? aspect.options : []
  const resolutions = resolution?.type === 'select' ? resolution.options : []
  const chosenSize = dimensions(next.size)
  const matchesAspect = (ratio: number, candidate: number) => Math.abs(ratio / candidate - 1) < 0.02
  const sizeResolution = (width: number, height: number) =>
    resolutions.find((option) => resolutionPixels(option.value) === Math.min(width, height))?.value
  if (changed === 'size' && chosenSize) {
    const [width, height] = chosenSize
    const match = ratios.find((option) => {
      const ratio = aspectRatio(option.value)
      return ratio !== undefined && matchesAspect(width / height, ratio)
    })
    if (match) next.aspect_ratio = match.value
    const quality = sizeResolution(width, height)
    if (quality !== undefined) next.resolution = quality
  }
  const ratio = aspectRatio(next.aspect_ratio ?? aspect?.default)
  const quality = resolutionPixels(next.resolution ?? resolution?.default)
  const options = size.options.filter((option) => {
    const pixels = dimensions(option.value)
    if (!pixels) return true
    const [width, height] = pixels
    const knownResolution = sizeResolution(width, height)
    return (
      (ratio === undefined || matchesAspect(width / height, ratio)) &&
      (quality === undefined ||
        knownResolution === undefined ||
        resolutionPixels(knownResolution) === quality)
    )
  })
  if (next.size !== undefined && !options.some((option) => option.value === next.size))
    delete next.size
  if (next.size === undefined && options.length && options.length !== size.options.length) {
    next.size = options.find((option) => option.value === size.default)?.value ?? options[0]?.value
  }
  return {
    values: next,
    fields: fields.flatMap((field) =>
      field === size
        ? options.length
          ? [{ ...size, options, default: next.size ?? options[0]?.value }]
          : []
        : [field],
    ),
  }
}
