import { hoverProfile } from './ghost-motion'
import { WALK_SECONDS } from './handoff'
import { activityAnchor, MODULE_HEIGHT } from './layout'
import type { VisualState } from './state'

type Point = { x: number; y: number }
export type IdleBehaviour = 'local_idle' | 'coffee' | 'lounge' | 'wander' | 'social'
type Trip = { kind: IdleBehaviour; points: Point[]; distance: number; length: number; pause: number; dwell: number; returning: boolean; returnSpeed?: number }
type Entry = { home: Point; coffee: Point; activity: string; module: number; wait: number; cycle: number; lastKind?: IdleBehaviour; trip?: Trip }
export type OfficeActivity = Point & { dx: number; dy: number; phase: 'desk' | 'outbound' | 'pause' | 'returning'; prop?: 'cup' | 'paper'; working: boolean; behaviour?: IdleBehaviour }
const length = (points: Point[]) => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0)
function position(points: Point[], distance: number): Point {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], size = Math.hypot(b.x - a.x, b.y - a.y)
    if (distance <= size) { const t = size ? distance / size : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
    distance -= size
  }
  return points[points.length - 1]
}
// Each of the six reserved desks has a separate spot around the coffee/lounge area.
// Uneven spacing and bounded identity offsets avoid a rigid lineup without allowing
// polling, roster order, or another visitor leaving to move an established group.
function coffeeAnchor(home: Point, id: string): Point {
  const module = Math.floor(home.y / MODULE_HEIGHT)
  const row = Math.floor((home.y % MODULE_HEIGHT - 148) / 128)
  const slot = row * 2 + (home.x > 200 ? 1 : 0)
  const spots = [[480, 260], [529, 255], [581, 262], [477, 310], [530, 305], [583, 312]]
  const [x, y] = spots[slot]
  const phase = hoverProfile(id).phase
  return { x: x + Math.sin(phase) * 3, y: module * MODULE_HEIGHT + y + Math.cos(phase) * 3 }
}

/** Shared-clock state machine. Finite independent idle visits, identity-staggered
 * departures, and retraced paths on activity changes. No provider mutations. */
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
          entries.set(agent.id, { home, coffee: coffeeAnchor(home, agent.id), module: Math.floor(home.y / MODULE_HEIGHT), activity: agent.activity, wait: delay(agent.id), cycle: 0 })
        } else if (previous.activity !== agent.activity) {
          previous.activity = agent.activity
          previous.wait = delay(agent.id)
          if (previous.trip) { previous.trip.returning = true; previous.trip.returnSpeed = Math.max(42, previous.trip.distance / WALK_SECONDS) }
        }
      }
    },
    // Snapshot the occupied prefix before the courier's idle trip is cleared.
    // Retracing these segments preserves furniture clearance from every idle origin.
    returnPath(id: string): Point[] {
      const e = entries.get(id)!, trip = e.trip
      if (!trip) return [e.home]
      const visited = [trip.points[0]]
      let remaining = trip.distance
      for (let i = 1; i < trip.points.length; i++) {
        const a = trip.points[i - 1], b = trip.points[i]
        const segment = Math.hypot(b.x - a.x, b.y - a.y)
        if (remaining < segment) break
        visited.push(b)
        remaining -= segment
      }
      return [position(trip.points, trip.distance), ...visited.reverse()]
    },
    sample(id: string, dt: number, reduced: boolean, interrupted = false): OfficeActivity {
      const e = entries.get(id)!
      const desk: OfficeActivity = { ...e.home, dx: 0, dy: 0, phase: 'desk', working: e.activity === 'working' }
      if (reduced) { e.trip = undefined; e.wait = delay(id); return desk }
      const delta = Math.max(0, Math.min(dt, 0.1))
      if (interrupted) {
        e.wait = delay(id)
        if (e.trip) {
          e.trip.returning = true
          // Capture once: recomputing from remaining distance would slow the return
          // every frame and leave the recipient away from the handoff bubble.
          e.trip.returnSpeed ??= Math.max(42, e.trip.distance / WALK_SECONDS)
        }
        else return desk
      }
      if (!e.trip) {
        e.wait -= delta
        if (e.wait > 0 || e.activity !== 'idle') return desk
        const y = e.module * MODULE_HEIGHT
        // Avalanche the stable identity/cycle hash so adjacent cycles are unrelated.
        let seed = Math.floor(hoverProfile(`${id}:${e.cycle++}`).phase / (Math.PI * 2) * 0x100000000)
        seed = Math.imul(seed ^ seed >>> 16, 0x7feb352d)
        seed = Math.imul(seed ^ seed >>> 15, 0x846ca68b)
        const decision = ((seed ^ seed >>> 16) >>> 0) / 0x100000000
        const kinds: IdleBehaviour[] = ['local_idle', 'coffee', 'lounge', 'wander', 'social']
        let kind = kinds[Math.floor(decision * kinds.length)]
        if (kind === e.lastKind || (['coffee', 'social'].includes(kind) && ['coffee', 'social'].includes(e.lastKind ?? ''))) kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length]
        e.lastKind = kind
        // Existing clear circulation lanes; local pauses never cross desk furniture.
        const destination = kind === 'wander' ? { x: 400, y: y + 70 + decision * 18 }
          : kind === 'local_idle' ? { x: e.home.x + 18, y: e.home.y + 4 }
          : kind === 'lounge' ? { x: e.coffee.x, y: e.coffee.y + 32 } : e.coffee
        const points = kind === 'local_idle' ? [e.home, destination]
          : kind === 'wander' ? [e.home, { x: 400, y: e.home.y }, destination]
          : [e.home, { x: 400, y: e.home.y }, { x: 400, y: y + 184 }, { x: 445, y: y + 184 }, { x: 445, y: destination.y }, destination]
        e.trip = { kind, points, length: length(points), distance: 0, pause: 0, dwell: 14 + decision * 24, returning: false }
      }
      const trip = e.trip, before = position(trip.points, trip.distance)
      if (trip.returning) trip.distance = Math.max(0, trip.distance - delta * (trip.returnSpeed ?? 42))
      else if (trip.distance < trip.length) trip.distance = Math.min(trip.length, trip.distance + delta * 42)
      else { trip.pause += delta; if (trip.pause >= trip.dwell) trip.returning = true }
      const current = position(trip.points, trip.distance)
      const phase = trip.returning ? 'returning' : trip.distance === trip.length ? 'pause' : 'outbound'
      const prop = trip.kind === 'coffee' && e.activity === 'idle' && !trip.returning && trip.pause > 0.5 ? 'cup' : undefined
      if (trip.returning && trip.distance === 0) { e.trip = undefined; e.wait = 8 + delay(`${id}:${e.cycle}`); return desk }
      return { ...current, dx: current.x - before.x, dy: current.y - before.y, phase, behaviour: trip.kind, prop: interrupted ? undefined : prop, working: e.activity === 'working' }
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
