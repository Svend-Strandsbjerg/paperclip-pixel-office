import { FRONT, type GhostPose } from './ghost-motion'
import { PALETTES, appearanceKey } from './identity'
import type { VisualAgent, VisualState } from './state'
import { deskBounds, workspacePad, officeLayout, MODULE_HEIGHT } from './layout'
import { studioVariant, sharedDecorBounds } from './environment'
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
// Lighting is alpha-masked to the actual native silhouette, once per loaded asset.
// Weak keys allow replaced/retried images and their small lighting surfaces to retire.
const contactShadows = [[29, 8, '#263d4309'], [25, 6, '#263d4312'], [20, 4, '#263d4324']] as const
const ghostLighting = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
function lightingFor(image: HTMLImageElement) {
  let layer = ghostLighting.get(image)
  if (layer) return layer
  layer = document.createElement('canvas')
  layer.width = layer.height = 192
  const light = layer.getContext('2d')!
  light.drawImage(image, 0, 0, 192, 192)
  light.globalCompositeOperation = 'source-in'
  const volume = light.createLinearGradient(35, 40, 153, 135)
  volume.addColorStop(0, '#ffffff55')
  volume.addColorStop(.35, '#ffffff00')
  volume.addColorStop(.65, '#243d4900')
  volume.addColorStop(1, '#243d493d')
  light.fillStyle = volume
  light.fillRect(0, 0, 192, 192)
  ghostLighting.set(image, layer)
  return layer
}
export function paintGhost(ctx: CanvasRenderingContext2D, agent: VisualAgent, x: number, y: number, pose: GhostPose = FRONT) {
  // Concentric translucent ellipses soften the contact without per-frame blur.
  for (const [width, height, color] of contactShadows) {
    ctx.fillStyle = color
    ctx.beginPath(); ctx.ellipse(x * 3, (y + 8) * 3, width, height, 0, 0, Math.PI * 2); ctx.fill()
  }
  // Ground shadow stays anchored. Transform the original image around its center;
  // never mirror its asymmetric identity or introduce body/stepping frames.
  ctx.save()
  const cx = x * 3, cy = (y - 10) * 3
  ctx.translate(cx + pose.turn * 3, cy + pose.lift * 3)
  ctx.rotate(pose.turn * 0.07)
  ctx.transform(1 - Math.abs(pose.turn) * 0.045, 0, pose.turn * 0.055, 1 + pose.pitch * 0.035, 0, pose.pitch * 1.5)
  ctx.translate(-cx, -cy)
  const image = ghostImage(agent)
  if (image) {
    ctx.drawImage(image, (x - 16) * 3, (y - 26) * 3, 96, 96)
    ctx.drawImage(lightingFor(image), (x - 16) * 3, (y - 26) * 3, 96, 96)
  }
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
  ctx.restore()
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

/** Static material and lighting layers are cached by the renderer at device DPI. */
export function paintStudio(ctx: CanvasRenderingContext2D, state: VisualState) {
  const layout = officeLayout(state)
  ctx.save(); ctx.scale(3, 3)
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 6) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill()
  }
  const oval = (x: number, y: number, w: number, h: number, color: string, angle = 0) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, w, h, angle, 0, Math.PI * 2); ctx.fill()
  }
  const plant = (x: number, y: number, kind: number, scale = 1) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale)
    oval(2, 13, 14, 4, '#394c4420')
    box(-9, 0, 18, 15, '#bd9278', 5)
    box(-10, 0, 20, 4, '#dcc4a8', 2)
    box(-1, -29, 2, 30, '#748676', 1)
    for (const [dx, dy] of [[-8, -10], [7, -17], [-4, -26], [4, -33]]) {
      oval(dx, dy, kind === 1 ? 5 : 8, kind === 2 ? 8 : 12, dx < 0 ? '#78917b' : '#92aa86', dx / 12)
    }
    ctx.restore()
  }
  const mug = (x: number, y: number) => {
    oval(x + 4, y + 2, 3, 3, '#eee5d3')
    box(x - 3, y - 2, 7, 8, '#f6ecda', 2)
    oval(x, y - 1, 2, 1, '#937964')
  }
  box(0, 0, layout.width, layout.height, '#b6ccc9', 0)
  for (const m of layout.modules) {
    const y = m.y, v = studioVariant(m.index)
    box(m.x, y + 3, m.width, m.height, '#152f3338', 14)
    box(m.x, y, m.width, m.height, '#eee5d3', 12)
    // Quiet oak flooring; staggered joins suggest material without a busy grid.
    for (let row = 0; row < 17; row++) {
      const fy = y + 9 + row * 24
      box(20, fy, 600, .6, '#a8947628', 0)
      for (let x = 30 + (row % 3) * 58; x < 620; x += 174) box(x, fy, .6, 23, '#a894761c', 0)
    }
    // Continuous clerestory glazing opens the full studio to sky and distant trees.
    box(24, y + 4, 584, 44, '#8faeaf', 5)
    box(27, y + 6, 578, 38, '#c5e4ec', 3)
    box(27, y + 28, 578, 16, '#ddebdc', 0)
    for (const x of [62, 214, 378, 550]) {
      oval(x, y + 36, 27, 7, '#b5cec0')
      box(x + 16, y + 12, 42, 3, '#f5fbfa', 2)
    }
    for (const x of [27, 171, 315, 459, 602]) box(x, y + 5, 3, 39, '#f8faf1', 0)
    box(24, y + 44, 584, 4, '#fff9e9', 2)
    // Window-sill greenery adds life to each workspace without entering its aisles.
    for (const x of [48, 196, 402]) {
      box(x - 13, y + 38, 26, 8, '#e0d1b8', 3)
      for (const dx of [-7, 0, 7]) oval(x + dx, y + 35, 5, 7, dx ? '#91a58a' : '#6e8b79', dx / 10)
      box(x - 12, y + 40, 24, 1, '#faf1df', 1)
    }
    // Broad daylight is cached below every desk, label and avatar.
    const daylight = ctx.createLinearGradient(0, y + 48, 0, y + 255)
    daylight.addColorStop(0, '#fffbea88'); daylight.addColorStop(1, '#fffbea00')
    ctx.fillStyle = daylight; ctx.fillRect(24, y + 48, 584, 207)
    // Open glass edge, outside circulation and all activity destinations.
    box(614, y + 55, 5, 322, '#b9d9d466', 2)
    box(616, y + 55, 1, 322, '#f8fffa', 0)
    const bounds = sharedDecorBounds(m.index)
    ctx.save(); ctx.beginPath(); ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height); ctx.clip()
    // Glass has a floor shadow, pale reflection and slim metal posts.
    box(434, y + 47, 7, 318, '#596f6815', 3)
    box(432, y + 42, 3, 112, '#accbc34d', 1)
    box(432, y + 202, 3, 152, '#accbc34d', 1)
    box(433, y + 46, 1, 108, '#f6fff6bb', 0)
    box(433, y + 202, 1, 138, '#f6fff6bb', 0)
    for (const dy of [44, 154, 202, 350]) box(432, y + dy, 4, 5, '#758a83', 1)
    // Collaboration: rounded woven rug, idea board, oak meeting table.
    box(448, y + 42, 156, 137, v.rug, v.roundedRug ? 28 : 8)
    box(455, y + 48, 142, 124, '#f4efdf22', v.roundedRug ? 25 : 6)
    box(465, y + 48, 124, 45, '#50646126', 5)
    box(463, y + 45, 124, 44, '#b89d7f', 4)
    box(466, y + 48, 118, 37, '#f4f0df', 2)
    for (let note = 0; note < 5; note++) {
      const nx = 475 + note * 19, ny = y + 55 + (note + v.board) % 2 * 8
      box(nx, ny, 10, 8, ['#d5c48e', '#b9ccbf', '#d5b5a0'][(note + v.board) % 3], 1)
      if (note < 4) box(nx + 11, ny + 3, 6, 1, '#a5b0a1', 0)
    }
    for (const x of [467, 577]) {
      box(x, y + 117, 15, 29, '#435f6520', 6)
      box(x - 1, y + 113, 15, 27, v.textile, 6)
      box(x + 2, y + 115, 9, 2, '#e5e6d466', 1)
    }
    box(487, y + 123, 82, 36, '#554b3c20', 16)
    box(483, y + 110, 88, 39, v.wood, 16)
    box(489, y + 115, 76, 1, '#f6dfb84d', 0)
    box(517, y + 119, 18, 13, '#71878a', 2)
    box(519, y + 120, 14, 10, '#c8d7d2', 1)
    mug(547, y + 123)
    // Generic planning marks and a board tray; no live project information.
    box(475, y + 76, 42, 1, '#a6b8b0', 0)
    box(475, y + 80, 27, 1, '#b8c6ba', 0)
    box(552, y + 85, 26, 2, '#879d94', 1)
    box(560, y + 83, 9, 2, v.accent, 1)
    // Coffee and metal shelving form a smaller material zone between the rugs.
    box(454, y + 187, 145, 48, '#b5b8aa', 5)
    box(458, y + 190, 137, 8, v.wood, 2)
    box(459, y + 216, 135, 3, '#77857d', 1)
    for (const x of [459, 591]) box(x, y + 196, 3, 32, '#6c7d76', 1)
    for (let b = 0; b < v.books.length; b++) box(472 + b * 9, y + 216 - v.books[b], 6, v.books[b], b % 2 ? v.accent : '#879a8c', 1)
    box(561, y + 172, 23, 20, '#5f716d', 3)
    box(565, y + 175, 15, 6, '#c4cebf', 1)
    box(569, y + 183, 6, 7, '#eee4cf', 1)
    mug(548, y + 185)
    plant(472, y + 184, v.leaf, .48)
    box(506, y + 182, 20, 9, '#d8c8aa', 2)
    for (const x of [510, 516, 522]) box(x, y + 180, 3, 7, '#f6eddb', 1)
    box(550, y + 220, 24, 9, '#d7d6c4', 2)
    box(558, y + 223, 8, 2, '#98a69a', 1)
    // Informal lounge: asymmetric upholstery, woven rug and a warm reading lamp.
    box(449, y + 246, 155, 133, v.rug, v.roundedRug ? 36 : 12)
    for (let line = 0; line < 4; line++) box(465, y + 357 + line * 3, 82, 1, '#f6f0df44', 0)
    const sx = 461 + v.loungeShift
    box(sx + 3, y + 268, 93, 35, '#445a4f25', 10)
    box(sx, y + 256, 93, 40, v.textile, 9)
    box(sx + 5, y + 260, 83, 10, '#e9e6d329', 5)
    for (const dx of [8, 47]) box(sx + dx, y + 272, 36, 18, '#f1e7d521', 4)
    box(sx + 11, y + 271, 15, 14, '#dfc7a7', 4)
    oval(526, y + 332, 34, 16, '#42574b1c')
    box(492, y + 313, 65, 27, '#f0dbb9', 13)
    box(507, y + 317, 18, 12, v.accent, 2)
    box(509, y + 317, 2, 12, '#eee3cd', 0)
    mug(539, y + 323)
    plant(v.plantSide, y + 351, v.leaf, .9)
    const lx = v.plantSide === 590 ? 466 : 586
    oval(lx, y + 312, 22, 12, '#f9e7bd25')
    oval(lx, y + 305, 16, 6, '#f9e7bd44')
    box(lx - 1, y + 293, 2, 30, '#8b8d79', 1)
    oval(lx, y + 324, 7, 3, '#9e9e88')
    box(lx - 9, y + 288, 18, 11, '#f4dfac', 5)
    ctx.restore()
    ctx.fillStyle = '#65766c'; ctx.font = '9px system-ui'; ctx.fillText(`STUDIO ${String(m.index + 1).padStart(2, '0')}`, m.x + 16, y + m.height - 13)
  }
  for (const a of state) {
    const x = a.col * 16 + 8, y = a.row * 16 + 8
    const v = studioVariant(Math.floor((a.row - 6) / (MODULE_HEIGHT / 16)))
    const pad = workspacePad(a), desk = deskBounds(a)
    // Low-contrast textiles behind ghosts; all solid props remain on desktops.
    box(pad.x + (a.col % 2 ? 4 : 0), pad.y, pad.width - 4, pad.height, v.rug + '88', v.roundedRug ? 24 : 10)
    // Grounding stays visible above the rug and below the desktop.
    oval(x + 2, desk.y + desk.height, 38, 5, '#554a3814')
    box(desk.x, desk.y + 3, desk.width, desk.height - 3, '#927357', 6)
    box(desk.x, desk.y, desk.width, desk.height - 3, v.wood, 6)
    box(desk.x + 5, desk.y + 3, desk.width - 10, 1, '#f4debd66', 0)
    box(x - 18, y - 19, 36, 17, '#435c60', 3)
    box(x - 15, y - 16, 30, 11, '#bfd8d5', 2)
    box(x - 12, y - 14, 19, 2, '#e6ece0', 1)
    box(x - 6, y - 2, 12, 2, '#71827d', 1)
    // A compact task lamp and stationery make every occupied desk feel personal.
    oval(x - 28, y - 4, 6, 2, '#687c742b')
    box(x - 29, y - 17, 2, 12, '#7f8e80', 1)
    box(x - 33, y - 19, 11, 5, '#e9d9b3', 2)
    box(x + 6, y + 1, 16, 6, '#eee6d5', 1)
    box(x + 8, y + 3, 10, 1, '#b1b9aa', 0)
    if ((a.row + a.col) % 3 === 0) {
      box(x + 23, y - 18, 10, 13, v.accent, 2)
      box(x + 25, y - 17, 1, 11, '#f3e6c9', 0)
    } else mug(x + 27, y - 16)
  }
  // Standing west-edge props must cover every occupied workspace rug.
  for (const m of layout.modules) {
    const y = m.y, v = studioVariant(m.index)
    // Slim storage and framed art on the west edge, clear of every reserved seat
    // and of the existing handoff/coffee lanes, including future six-seat modules.
    box(28, y + 177, 27, 27, '#aa987e', 3)
    box(30, y + 179, 23, 23, '#f5edda', 2)
    oval(39, y + 187, 5, 5, v.accent)
    box(33, y + 194, 17, 5, '#aebba4', 2)
    box(29, y + 219, 27, 27, '#546d6020', 4)
    box(27, y + 215, 27, 27, v.wood, 3)
    box(29, y + 218, 23, 17, '#8c7964', 1)
    for (let b = 0; b < 4; b++) box(31 + b * 5, y + 221 + b % 2 * 3, 4, 13 - b % 2 * 3, b % 2 ? v.accent : '#d4d6b9', 1)
    plant(41, y + 353, v.leaf, .65)
  }
  ctx.restore()
}
