// Stay within the legacy iOS canvas area budget and a conservative axis limit.
export const MAX_CANVAS_AREA = 16_777_216
export const MAX_CANVAS_DIMENSION = 8192

/** Keep the floor readable; extra rooms extend the scroll area, never reduce zoom. */
export function studioViewport(size: { width: number; height: number }, availableWidth: number, devicePixelRatio: number) {
  const scale = Math.max(1.15, availableWidth / size.width)
  const width = size.width * scale
  const height = size.height * scale
  const ratio = Math.max(1, devicePixelRatio || 1)
  let bufferWidth = Math.ceil(width * ratio)
  let bufferHeight = Math.ceil(height * ratio)
  let effectivePixelRatio = ratio
  if (bufferWidth * bufferHeight > MAX_CANVAS_AREA || Math.max(bufferWidth, bufferHeight) > MAX_CANVAS_DIMENSION) {
    const safeRatio = Math.min(ratio, MAX_CANVAS_DIMENSION / width, MAX_CANVAS_DIMENSION / height, Math.sqrt(MAX_CANVAS_AREA / (width * height)))
    // Round down before deriving the drawing scale: rounding up can breach the
    // area budget. Allow sub-1 DPR for exceptionally tall floors, without zooming out.
    bufferWidth = Math.max(1, Math.floor(width * safeRatio))
    bufferHeight = Math.max(1, Math.floor(height * safeRatio))
    effectivePixelRatio = Math.min(bufferWidth / width, bufferHeight / height)
    // Cover the shared drawing ratio, with at most one partial edge pixel.
    // Keep the already-safe bounds even if floating-point multiplication rounds up.
    bufferWidth = Math.min(bufferWidth, Math.ceil(width * effectivePixelRatio))
    bufferHeight = Math.min(bufferHeight, Math.ceil(height * effectivePixelRatio))
  }
  return { scale, width, height, bufferWidth, bufferHeight, effectivePixelRatio }
}
