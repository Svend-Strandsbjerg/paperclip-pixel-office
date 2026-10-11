/** Presentation-only profiles. Coordinates are local to any supplied activity anchor. */
export const ACTIVITY_PROFILES = ['coordinate', 'build', 'inspect', 'review', 'research', 'write'] as const
export type ActivityProfile = typeof ACTIVITY_PROFILES[number]
export const ACTIVITY_PRESENTATION: Record<ActivityProfile, { label: string; icon: string; accessory?: 'glasses' | 'headset' }> = {
  coordinate: { label: 'Coordinating', icon: '▦' },
  build: { label: 'Building', icon: '▣', accessory: 'headset' },
  inspect: { label: 'Inspecting', icon: '⌕', accessory: 'glasses' },
  review: { label: 'Reviewing', icon: '✓', accessory: 'glasses' },
  research: { label: 'Researching', icon: '◇', accessory: 'glasses' },
  write: { label: 'Writing', icon: '≡', accessory: 'headset' },
}
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
      const sort = ease(p * 3 - i * 0.45)
      const x = -15 + i * 11, y = -3 + (1 - sort) * 7
      rect(x, y, 8, 10)
      rect(x + 2, y + 3, 4, 1, p > 0.7 && i === 2 ? highlight : ink)
      if (sort === 1 && i < 2) rect(x + 8, y + 5, 3, 1, ink)
    }
  },
  build(rect, p) {
    rect(-10, 13, 27, 1, ink) // assembly bench / stable base
    for (let i = 0; i < 5; i++) {
      const t = ease(p * 2.5 - i * 0.22)
      const x = (i % 3 - 1) * 7, y = -Math.floor(i / 3) * 7 + 6
      rect(x + (1 - t) * (i % 2 ? 13 : -13), y - (1 - t) * 9, 6, 6, i % 2 ? highlight : '#98c4d0')
      rect(x + (1 - t) * (i % 2 ? 13 : -13), y - (1 - t) * 9, 6, 1, '#e4f0db')
    }
    if (p > 0.75) { rect(-8, -5, 18, 1, highlight); rect(12, 1, 2, 3, highlight) }
  },
  inspect(rect, p) {
    rect(-11, -3, 22, 15)
    for (let i = 0; i < 3; i++) rect(-8, i * 4, 15, 1, ink)
    const row = Math.min(2, Math.floor(p * 3))
    rect(-9, row * 4 - 1, 17, 3, highlight)
    rect(-9, -2 + p * 12, 18, 1, '#d7aa66')
    if (p > 0.75) { rect(10, 7, 2, 3, highlight); rect(12, 5, 2, 4, highlight) }
  },
  review(rect, p) {
    rect(-10, -5, 20, 19)
    const page = Math.floor(p * 3)
    for (let i = 0; i < 4; i++) {
      rect(-7, -2 + i * 3, 10 - (i + page) % 3, 1, ink)
      if (p * 4 > i) rect(5, -2 + i * 3, 3, 2, highlight)
    }
    if (p > 0.72) { rect(11, 5, 2, 3, highlight); rect(13, 3, 2, 4, highlight) }
  },
  research(rect, p) {
    const gather = ease(p * 1.8)
    for (let i = 0; i < 4; i++) {
      const discard = i === 3 ? ease((p - 0.45) * 3) : 0
      const x = (i % 2 ? 1 : -1) * (17 * (1 - gather) + 3 + discard * 10)
      const y = (Math.floor(i / 2) * 2 - 1) * 6 * (1 - gather)
      if (discard < 1) {
        rect(x, y, 6 * (1 - discard), 5, '#98c4d0')
        rect(x, y + 2, 4 * (1 - discard), 1, i === Math.floor(p * 4) ? highlight : ink)
      }
    }
    if (p > 0.6) { rect(-4, -2, 9, 12); rect(-2, 2, 5, 2, highlight); rect(-2, 6, 5, 1, ink) }
  },
  write(rect, p) {
    rect(-7, -4, 15, 18)
    for (let i = 0; i < 5; i++) {
      const length = ease(p * 6 - i) * (i === 4 ? 6 : 10)
      if (length) rect(-5, -1 + i * 3, length, 1, ink)
      if (p * 6 >= i && p * 6 < i + 1) rect(-4 + length, -3 + i * 3, 2, 4, '#d7aa66')
    }
    if (p > 0.86) { rect(4, -4, 4, 3, highlight); rect(-5, 13, 10, 1, highlight) }
  },
}

/** No room, identity, furniture, assets, timers or network dependencies. */
export function paintWorkActivity(ctx: CanvasRenderingContext2D, anchor: { x: number; y: number }, frame: ActivityFrame, scale = 1) {
  ctx.save()
  ctx.globalAlpha = frame.opacity * 0.9
  // Effects sit beside the avatar, clear of its face and silhouette.
  profiles[frame.profile]((x, y, w, h, color = '#eef0d9') => {
    ctx.fillStyle = color
    ctx.fillRect((anchor.x + (42 + x)) * scale, (anchor.y + (y - 24)) * scale, w * scale, h * scale)
  }, frame.progress)
  ctx.restore()
}
