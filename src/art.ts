import { PALETTES, appearanceKey } from './identity'
import type { VisualAgent, VisualState } from './state'
import { sceneSize } from './scene'
/** The same native image is used on the canvas and in the roster. */
export function avatarPath(agent: VisualAgent) {
  const a = agent.identity?.appearance
  const native = agent.identity?.avatarUrl?.match(/^\/api\/agent-avatars\/(cap-v1)\/([a-z-]+)\/rest\.png/)
  return native ? `/api/office-avatar/${native[1]}/${native[2]}.png` : a ? `/api/office-avatar/${a.characterVersion}/${a.paletteId}.png` : undefined
}
export function agentAccent(agent: VisualAgent) {
  return agent.identity?.appearance ? PALETTES[agent.identity.appearance.paletteId][0] : agent.color
}
export function portraitKey(agent: VisualAgent) {
  return `${appearanceKey(agent.identity) ?? `local:${agent.id}`}:${agent.identity?.avatarUrl ?? ''}`
}
// Neutral ghost for demo, missing metadata, loading and failed assets; never a fabricated identity.
export const fallbackGhost = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#c6ced4" d="M14 51V29a18 18 0 0 1 36 0v22l-9-5-9 5-9-5z"/><path fill="#283c43" d="M24 27h5v7h-5zm12 0h5v7h-5z"/></svg>')
const ghosts = new Map<string, { image: HTMLImageElement; retryAt: number }>()
export function ghostImage(agent: VisualAgent, now = Date.now()) {
  const path = avatarPath(agent) ?? fallbackGhost
  let entry = ghosts.get(path)
  if (!entry || (entry.retryAt > 0 && now >= entry.retryAt)) {
    const image = new Image()
    entry = { image, retryAt: 0 }
    const pending = entry
    image.onerror = () => { pending.retryAt = Date.now() + 30_000 }
    image.src = path
    ghosts.set(path, entry)
  }
  return entry.image.complete && entry.image.naturalWidth > 0 ? entry.image : undefined
}
export function paintGhost(ctx: CanvasRenderingContext2D, agent: VisualAgent, x: number, y: number) {
  ctx.fillStyle = '#263d4366'
  ctx.beginPath(); ctx.ellipse(x * 3, (y + 8) * 3, 21, 5, 0, 0, Math.PI * 2); ctx.fill()
  const image = ghostImage(agent)
  if (image) ctx.drawImage(image, (x - 16) * 3, (y - 26) * 3, 96, 96)
  else {
    ctx.fillStyle = '#c6ced4'
    ctx.beginPath(); ctx.arc(x * 3, (y - 12) * 3, 24, Math.PI, 0)
    ctx.lineTo((x + 8) * 3, (y + 1) * 3)
    for (let i = 8; i >= -8; i -= 4) ctx.lineTo((x + i) * 3, (y + (i % 8 === 0 ? 1 : -2)) * 3)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = '#283c43'
    ctx.fillRect((x - 4) * 3, (y - 13) * 3, 6, 9)
    ctx.fillRect((x + 2) * 3, (y - 13) * 3, 6, 9)
  }
}
export function paintPortrait(image: HTMLImageElement, agent: VisualAgent) {
  const key = portraitKey(agent)
  if (image.dataset.identity === key && !(Number(image.dataset.retryAt) <= Date.now())) return
  image.dataset.identity = key
  delete image.dataset.retryAt
  image.onerror = () => {
    image.onerror = null
    image.src = fallbackGhost
    image.dataset.retryAt = String(Date.now() + 30_000)
  }
  image.src = avatarPath(agent) ?? fallbackGhost
}

/** Original integer-grid artwork, behind the existing depth-sorted furniture.
 * Coordinates preserve the central and cross-office handoff aisles. */
export function paintStudio(ctx: CanvasRenderingContext2D, state: VisualState) {
  ctx.save(); ctx.scale(3, 3)
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h)
  }
  const { height } = sceneSize(state)
  rect(0, 0, 384, height, '#233942')
  rect(16, 32, 352, height - 48, '#b2a48c')
  for (let y = 32; y < height - 16; y += 16) {
    rect(16, y, 352, 1, '#8e8878')
    for (let x = 16 + (y % 32 ? 24 : 0); x < 368; x += 48) {
      rect(x, y + 1, 1, 15, '#9b947f')
      rect(x + 5, y + 5, Math.min(18, 364 - x), 1, '#bfb198')
    }
  }
  rect(16, 30, 352, 4, '#142d35'); rect(16, 34, 352, 2, '#d6c6a3')
  rect(16, height - 20, 352, 4, '#857b67')
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
  rect(162, height - 19, 60, 3, '#ddc59a'); rect(162, height - 16, 60, 7, '#152e37')
  ctx.restore()
}
