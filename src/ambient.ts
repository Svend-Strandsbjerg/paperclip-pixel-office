import { hoverProfile } from './ghost-motion'
import type { VisualState } from './state'

/** Small excursions in the clear space immediately in front of each desk.
 * Stable identity phases share the renderer clock; no timers or random sampling. */
export function ambientMotion() {
  const entries = new Map<string, { phase: number; period: number; x: number; y: number; resumeAt: number }>()
  return {
    sync(state: VisualState) {
      const ids = new Set(state.map(a => a.id))
      for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id)
      for (const a of state) if (!entries.has(a.id)) {
        const p = hoverProfile(a.id)
        entries.set(a.id, { phase: p.phase / (Math.PI * 2), period: 24 + p.period * 3, x: 0, y: 0, resumeAt: 0 })
      }
    },
    sample(id: string, seconds: number, dt: number, enabled: boolean, reduced: boolean, handoff: boolean) {
      const e = entries.get(id)
      if (!e) return { x: 0, y: 0, dx: 0, dy: 0 }
      if (handoff) e.resumeAt = seconds + 8
      const previousX = e.x, previousY = e.y
      const cycle = (seconds + e.phase * e.period) % e.period
      const progress = enabled && !reduced && !handoff && seconds >= e.resumeAt && cycle < 8 ? Math.sin(Math.PI * cycle / 8) ** 2 : 0
      const x = (e.phase < 0.5 ? -1 : 1) * 8 * progress, y = 3 * progress
      const blend = 1 - Math.exp(-Math.max(0, dt) / 0.3)
      e.x = reduced ? 0 : e.x + (x - e.x) * blend
      e.y = reduced ? 0 : e.y + (y - e.y) * blend
      return { x: e.x, y: e.y, dx: Math.abs(e.x - previousX) > 0.005 ? e.x - previousX : 0, dy: Math.abs(e.y - previousY) > 0.005 ? e.y - previousY : 0 }
    },
  }
}
