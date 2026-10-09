import { PALETTES, appearanceKey } from './identity'
import type { VisualAgent, VisualState } from './state'
import { getCharacterSprites, CHARACTER_PALETTES } from './vendor/pixel-agents/office/sprites/spriteData'
import { getCachedSprite } from './vendor/pixel-agents/office/sprites/spriteCache'
import { Direction } from './vendor/pixel-agents/office/types'

const sprites = new Map<string, ReturnType<typeof getCharacterSprites>>()
export function agentSprites(agent: VisualAgent) {
  const key = portraitKey(agent)
  const cached = sprites.get(key)
  if (cached) return cached
  const colors = agent.identity?.appearance ? PALETTES[agent.identity.appearance.paletteId] : undefined
  // The entire live character palette belongs to the appearance, never the desk role.
  const result = colors ? getCharacterSprites(0, 0, {
    hair: colors[0], skin: colors[1], shirt: colors[0], pants: colors[1], shoes: '#283c43',
  }) : getCharacterSprites(agent.palette, 0, CHARACTER_PALETTES[agent.palette])
  sprites.set(key, result)
  return result
}
export function agentAccent(agent: VisualAgent) {
  return agent.identity?.appearance ? PALETTES[agent.identity.appearance.paletteId][0] : agent.color
}
export function portraitKey(agent: VisualAgent) {
  return appearanceKey(agent.identity) ?? `local:${agent.id}`
}

export function paintPortrait(image: HTMLImageElement, agent: VisualAgent) {
  const key = portraitKey(agent)
  if (image.dataset.identity === key) return
  const canvas = document.createElement("canvas")
  canvas.width = 48; canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, 48, 64)
  ctx.drawImage(getCachedSprite(agentSprites(agent).walk[Direction.DOWN][1], 3), 0, -8)
  image.src = canvas.toDataURL()
  image.dataset.identity = key
}

/** Original integer-grid artwork, behind the existing depth-sorted furniture.
 * Coordinates preserve the central and cross-office handoff aisles. */
export function paintStudio(ctx: CanvasRenderingContext2D, state: VisualState) {
  ctx.save(); ctx.scale(3, 3)
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h)
  }
  rect(0, 0, 384, 272, '#233942')
  rect(16, 32, 352, 224, '#b2a48c')
  for (let y = 32; y < 256; y += 16) {
    rect(16, y, 352, 1, '#8e8878')
    for (let x = 16 + (y % 32 ? 24 : 0); x < 368; x += 48) {
      rect(x, y + 1, 1, 15, '#9b947f')
      rect(x + 5, y + 5, Math.min(18, 364 - x), 1, '#bfb198')
    }
  }
  rect(16, 30, 352, 4, '#142d35'); rect(16, 34, 352, 2, '#d6c6a3')
  rect(16, 252, 352, 4, '#857b67')
  for (const x of [70, 248]) {
    rect(x - 3, 4, 58, 27, '#142d35'); rect(x, 6, 52, 22, '#79a9bb')
    rect(x, 6, 52, 9, '#9dc5ce'); rect(x + 3, 17, 9, 11, '#5f879b')
    rect(x + 15, 13, 7, 15, '#628f9f'); rect(x + 37, 19, 12, 9, '#628f9f')
    rect(x + 25, 6, 2, 22, '#e0ceaa'); rect(x, 16, 52, 2, '#e0ceaa')
    rect(x - 3, 28, 58, 3, '#ead7b1')
  }
  for (const agent of state) {
    const x = agent.col * 16 + 8, y = agent.row * 16 + 8
    const accent = agentAccent(agent)
    rect(x - 43, y - 18, 88, 55, '#8b826e')
    rect(x - 44, y - 20, 88, 54, '#45606a')
    rect(x - 41, y - 17, 82, 48, '#354e58')
    rect(x - 41, y + 28, 82, 2, accent)
    for (let t = -36; t <= 36; t += 8) rect(x + t, y + 25, 3, 1, '#55737a')
    // Desk shadow and a personal lamp, journal and mug beside each workstation.
    rect(x - 19, y + 12, 40, 24, '#263d43')
    rect(x + 25, y + 1, 10, 3, '#263d43'); rect(x + 29, y - 11, 2, 13, '#d0b57e')
    rect(x + 24, y - 15, 12, 5, '#f0d49c'); rect(x + 27, y - 10, 6, 2, '#fff0bf')
    rect(x - 33, y + 4, 9, 12, accent); rect(x - 31, y + 6, 1, 8, '#f0dfb9')
    rect(x + 24, y + 11, 5, 6, '#e4d7bd'); rect(x + 29, y + 12, 2, 3, '#e4d7bd')
  }
  // Shared aisle runner and entrance threshold.
  rect(177, 76, 30, 143, '#9a947f')
  for (let y = 80; y < 216; y += 8) rect(181, y, 22, 1, '#b9ae94')
  rect(162, 253, 60, 3, '#ddc59a'); rect(162, 256, 60, 7, '#152e37')
  ctx.restore()
}
