import { FRONT, type GhostPose } from './ghost-motion'
import { PALETTES, appearanceKey } from './identity'
import type { VisualAgent, VisualState } from './state'
import { deskBounds, workspacePad, officeLayout } from './layout'
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
export function paintGhost(ctx: CanvasRenderingContext2D, agent: VisualAgent, x: number, y: number, pose: GhostPose = FRONT) {
  ctx.fillStyle = '#263d4366'
  ctx.beginPath(); ctx.ellipse(x * 3, (y + 8) * 3, 21, 5, 0, 0, Math.PI * 2); ctx.fill()
  // Ground shadow stays anchored. Transform the original image around its center;
  // never mirror its asymmetric identity or introduce body/stepping frames.
  ctx.save()
  const cx = x * 3, cy = (y - 10) * 3
  ctx.translate(cx + pose.turn * 3, cy + pose.lift * 3)
  ctx.rotate(pose.turn * 0.07)
  ctx.transform(1 - Math.abs(pose.turn) * 0.045, 0, pose.turn * 0.055, 1 + pose.pitch * 0.035, 0, pose.pitch * 1.5)
  ctx.translate(-cx, -cy)
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

/** Smooth, reusable architecture; native ghost images are painted separately. */
export function paintStudio(ctx: CanvasRenderingContext2D, state: VisualState) {
  const layout = officeLayout(state)
  ctx.save(); ctx.scale(3, 3)
  const box = (x: number, y: number, w: number, h: number, color: string, radius = 6) => {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill()
  }
  const plant = (x: number, y: number) => {
    box(x - 9, y, 18, 16, '#d2b492', 4)
    for (const [dx, dy] of [[-7, -6], [6, -10], [0, -18]]) {
      ctx.fillStyle = dx ? '#668b73' : '#86a583'; ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 8, 13, dx / 12, 0, Math.PI * 2); ctx.fill()
    }
  }
  box(0, 0, layout.width, layout.height, '#233942', 0)
  for (const m of layout.modules) {
    const y = m.y
    box(m.x, y, m.width, m.height, '#dbccb5', 12)
    for (let line = y + 24; line < y + m.height; line += 24) box(m.x + 4, line, m.width - 8, .5, '#c6b497', 0)
    box(28, y + 8, 388, 22, '#b7d4d5', 4)
    for (const x of [32, 160, 288, 412]) box(x, y + 8, 3, 22, '#eef3eb', 0)
    // Glass divider leaves the entire workspace circulation lane clear.
    box(m.workspaceRight, y + 40, 3, m.height - 72, '#8caaa688', 1)
    box(450, y + 44, 154, 160, '#c0ccc1', 12)
    box(468, y + 54, 116, 38, '#f5f5e9', 4)
    box(480, y + 66, 55, 3, '#90a99c', 1)
    box(480, y + 75, 85, 3, '#c2cec0', 1)
    box(484, y + 118, 84, 44, '#a77750', 18)
    for (const x of [470, 574]) box(x, y + 125, 12, 26, '#607c80', 5)
    box(450, y + 232, 154, 148, '#c5bba7', 18)
    box(466, y + 248, 100, 32, '#7f9891', 10)
    box(466, y + 248, 100, 9, '#68847d', 5)
    box(486, y + 300, 62, 30, '#efdcc0', 15)
    plant(589, y + 345)
    plant(590, y + 30)
    ctx.fillStyle = '#455e61'; ctx.font = '9px system-ui'; ctx.fillText(`STUDIO ${String(m.index + 1).padStart(2, '0')}`, m.x + 16, y + m.height - 13)
  }
  for (const a of state) {
    const x = a.col * 16 + 8, y = a.row * 16 + 8
    const pad = workspacePad(a), desk = deskBounds(a)
    box(pad.x, pad.y, pad.width, pad.height, '#b6b8a788', 16)
    box(desk.x, desk.y + 3, desk.width, desk.height - 3, '#8e664d', 6)
    box(desk.x, desk.y, desk.width, desk.height - 3, '#c99f73', 6)
    box(x - 18, y - 19, 36, 17, '#344c56', 3)
    box(x - 15, y - 16, 30, 11, '#a8c9ca', 2)
    box(x + 25, y - 18, 6, 9, '#fff2d5', 2)
  }
  ctx.restore()
}
