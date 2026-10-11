import { hoverProfile } from './ghost-motion'
import { activityAnchor, MODULE_HEIGHT } from './layout'
import type { VisualState } from './state'

type Point = { x: number; y: number }
type Trip = { kind: 'coffee' | 'work'; points: Point[]; distance: number; length: number; pause: number; returning: boolean }
type Entry = { home: Point; activity: string; module: number; wait: number; trip?: Trip }
export type OfficeActivity = Point & { dx: number; dy: number; phase: 'desk' | 'outbound' | 'pause' | 'returning'; prop?: 'cup' | 'paper'; working: boolean }
const length = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
function position(points: Point[], distance: number): Point {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], size = Math.hypot(b.x - a.x, b.y - a.y)
    if (distance <= size) { const t = size ? distance / size : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
    distance -= size
  }
  return points[points.length - 1]
}
/** Shared-clock state machine. One visitor per studio, identity-staggered cooldowns,
 * polling-stable state, and retraced paths on activity changes. No provider mutations. */
export function officeActivities() {
  const entries = new Map<string, Entry>()
  const delay = (id: string) => 16 + hoverProfile(id).phase * 4
  return {
    sync(state: VisualState) {
      const ids = new Set(state.map(a => a.id))
      for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id)
      for (const agent of state) {
        const home = activityAnchor(agent), previous = entries.get(agent.id)
        if (!previous || previous.home.x !== home.x || previous.home.y !== home.y) {
          entries.set(agent.id, { home, module: Math.floor(home.y / MODULE_HEIGHT), activity: agent.activity, wait: delay(agent.id) })
        } else if (previous.activity !== agent.activity) {
          previous.activity = agent.activity
          previous.wait = delay(agent.id)
          if (previous.trip) previous.trip.returning = true
        }
      }
    },
    sample(id: string, dt: number, reduced: boolean, interrupted = false): OfficeActivity {
      const e = entries.get(id)!
      const desk: OfficeActivity = { ...e.home, dx: 0, dy: 0, phase: 'desk', working: e.activity === 'working' }
      if (reduced) { e.trip = undefined; e.wait = delay(id); return desk }
      const delta = Math.max(0, Math.min(dt, 0.1))
      if (interrupted) {
        e.wait = delay(id)
        if (e.trip) e.trip.returning = true
        else return desk
      }
      if (!e.trip) {
        e.wait -= delta
        if (e.wait > 0 || [...entries.values()].some(other => other.module === e.module && other.trip)) return desk
        const y = e.module * MODULE_HEIGHT
        const kind = e.activity === 'idle' ? 'coffee' : 'work'
        const points = [e.home, { x: 400, y: e.home.y }, { x: 400, y: y + 184 }, { x: 445, y: y + 184 },
          ...(kind === 'work' ? [{ x: 525, y: y + 184 }] : [{ x: 445, y: y + 255 }, { x: 550, y: y + 255 }])]
        e.trip = { kind, points, length: length(points), distance: 0, pause: 0, returning: false }
      }
      const trip = e.trip, before = position(trip.points, trip.distance)
      if (trip.returning) trip.distance = Math.max(0, trip.distance - delta * 42)
      else if (trip.distance < trip.length) trip.distance = Math.min(trip.length, trip.distance + delta * 42)
      else { trip.pause += delta; if (trip.pause >= 5) trip.returning = true }
      const current = position(trip.points, trip.distance)
      const phase = trip.returning ? 'returning' : trip.distance === trip.length ? 'pause' : 'outbound'
      const prop = trip.kind === 'coffee' ? (e.activity === 'idle' && trip.pause > 0.5 ? 'cup' : undefined) : (e.activity === 'working' ? 'paper' : undefined)
      if (trip.returning && trip.distance === 0) { e.trip = undefined; e.wait = 60 + delay(id); return desk }
      return { ...current, dx: current.x - before.x, dy: current.y - before.y, phase, prop: interrupted ? undefined : prop, working: e.activity === 'working' }
    },
  }
}

export function paintCarriedItem(ctx: CanvasRenderingContext2D, frame: OfficeActivity, lift: number) {
  if (!frame.prop) return
  const x = (frame.x + 12) * 3, y = (frame.y - 15 + lift) * 3
  ctx.fillStyle = '#596575'; ctx.fillRect(x, y, 27, 30)
  ctx.fillStyle = '#fff4d6'; ctx.fillRect(x + 3, y + 3, 21, 24)
  ctx.fillStyle = '#8794a0'
  if (frame.prop === 'paper') { ctx.fillRect(x + 6, y + 9, 15, 3); ctx.fillRect(x + 6, y + 15, 12, 3) }
  else { ctx.fillStyle = '#937964'; ctx.fillRect(x + 3, y + 3, 21, 6); ctx.fillStyle = '#fff4d6'; ctx.fillRect(x + 27, y + 9, 6, 12) }
}
