/** Keep the floor readable; extra rooms extend the scroll area, never reduce zoom. */
export function studioViewport(size: { width: number; height: number }, availableWidth: number, devicePixelRatio: number) {
  const scale = Math.max(1.15, Math.min(1.35, availableWidth / size.width))
  const width = size.width * scale
  const height = size.height * scale
  const ratio = Math.max(1, devicePixelRatio || 1)
  return { scale, width, height, bufferWidth: Math.ceil(width * ratio), bufferHeight: Math.ceil(height * ratio) }
}
