/** Presentation-only profiles. Coordinates are local to any supplied activity anchor. */
export const ACTIVITY_PROFILES = ['coordinate', 'build', 'inspect', 'review', 'research', 'write'] as const
export type ActivityProfile = typeof ACTIVITY_PROFILES[number]
export const ACTIVITY_CYCLE_SECONDS = 18
export type ActivityFrame = { profile: ActivityProfile; progress: number; opacity: number }

export function selectActivity(id: string, epoch = 0): ActivityProfile {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  // Identity chooses a starting point and traversal direction; every cycle differs.
  const step = (hash >>> 8) % 2 ? 1 : 5
  return ACTIVITY_PROFILES[(hash % ACTIVITY_PROFILES.length + epoch * step) % ACTIVITY_PROFILES.length]
}

export function workActivities() {
  const entries = new Map<string, { seconds: number; epoch: number; reveal: number }>()
  return {
    sync(agents: readonly { id: string; activity: string }[]) {
      const working = new Set(agents.filter(a => a.activity === 'working').map(a => a.id))
      for (const id of entries.keys()) if (!working.has(id)) entries.delete(id)
      for (const id of working) if (!entries.has(id)) entries.set(id, { seconds: 0, epoch: 0, reveal: 0 })
    },
    sample(id: string, dt: number, reduced: boolean, interrupted = false): ActivityFrame | undefined {
      const entry = entries.get(id)
      if (!entry) return
      if (interrupted) { entry.reveal = 0; return }
      if (!reduced) {
        const delta = Math.max(0, dt)
        entry.seconds += delta
        entry.reveal = Math.min(1, entry.reveal + delta / 0.6)
        entry.epoch += Math.floor(entry.seconds / ACTIVITY_CYCLE_SECONDS)
        entry.seconds %= ACTIVITY_CYCLE_SECONDS
      }
      const progress = reduced ? 0.65 : entry.seconds / ACTIVITY_CYCLE_SECONDS
      return { profile: selectActivity(id, entry.epoch), progress,
        opacity: reduced ? 1 : Math.min(entry.reveal, progress * 30, (1 - progress) * 30) }
    },
  }
}

const ease = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t) }
type Painter = (rect: (x: number, y: number, w: number, h: number, color?: string) => void, p: number) => void
const ink = '#65818b', highlight = '#b8df99'
const profiles: Record<ActivityProfile, Painter> = {
  coordinate(rect, p) {
    for (let i = 0; i < 3; i++) {
      const shift = Math.sin(p * Math.PI * 2 + i * Math.PI * 2 / 3)
      rect(-15 + i * 11, shift * 3, 8, 10)
      rect(-13 + i * 11, shift * 3 + 3, 4, 1, Math.floor(p * 3) === i ? highlight : ink)
    }
  },
  build(rect, p) {
    for (let i = 0; i < 5; i++) {
      const t = ease(p * 2.5 - i * 0.22)
      const x = (i % 3 - 1) * 7, y = -Math.floor(i / 3) * 7 + 6
      rect(x + (1 - t) * (i % 2 ? 13 : -13), y - (1 - t) * 9, 6, 6, i % 2 ? highlight : '#98c4d0')
      rect(x + (1 - t) * (i % 2 ? 13 : -13), y - (1 - t) * 9, 6, 1, '#e4f0db')
    }
  },
  inspect(rect, p) {
    rect(-11, -3, 22, 15)
    for (let i = 0; i < 3; i++) rect(-8, i * 4, 15, 1, ink)
    const row = Math.min(2, Math.floor(p * 3))
    rect(-9, row * 4 - 1, 17, 3, highlight)
    rect(10, row * 4, 2, 2, ink)
  },
  review(rect, p) {
    for (let i = 0; i < 3; i++) {
      const shift = ease((p - i / 3) * 3) * 4
      rect(-12 + i * 7, -3 + i * 2 - shift, 10, 13)
      rect(-10 + i * 7, i * 2 - shift, 6, 1, ink)
    }
    if (p > 0.72) { rect(12, 5, 2, 3, highlight); rect(14, 3, 2, 4, highlight) }
  },
  research(rect, p) {
    const gather = ease(p * 1.8)
    for (let i = 0; i < 4; i++) {
      const discard = i === 3 ? ease((p - 0.45) * 3) : 0
      const x = (i % 2 ? 1 : -1) * (17 * (1 - gather) + 3 + discard * 10)
      const y = (Math.floor(i / 2) * 2 - 1) * 6 * (1 - gather)
      if (discard < 1) rect(x, y, 6 * (1 - discard), 5, '#98c4d0')
    }
    if (p > 0.6) { rect(-4, -2, 9, 12); rect(-2, 2, 5, 2, highlight) }
  },
  write(rect, p) {
    rect(-7, -4, 15, 18)
    for (let i = 0; i < 5; i++) {
      const length = ease(p * 6 - i) * (i === 4 ? 6 : 10)
      if (length) rect(-5, -1 + i * 3, length, 1, ink)
    }
  },
}

/** No room, identity, furniture, assets, timers or network dependencies. */
export function paintWorkActivity(ctx: CanvasRenderingContext2D, anchor: { x: number; y: number }, frame: ActivityFrame, scale = 1) {
  ctx.save()
  ctx.globalAlpha = frame.opacity * 0.9
  // Effects sit just below the avatar, leaving its face and silhouette readable.
  profiles[frame.profile]((x, y, w, h, color = '#eef0d9') => {
    ctx.fillStyle = color
    ctx.fillRect((anchor.x + x) * scale, (anchor.y + 9 + y) * scale, w * scale, h * scale)
  }, frame.progress)
  ctx.restore()
}
