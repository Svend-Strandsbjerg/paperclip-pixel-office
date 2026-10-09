/** Presentation only: identity selects timing, never artwork or routes. */
export function hoverProfile(id: string) {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  return {
    phase: (hash / 0x100000000) * Math.PI * 2,
    period: 3.6 + ((hash >>> 8) % 1800) / 1000,
    amplitude: 1.1 + ((hash >>> 20) % 700) / 1000,
  }
}
export type GhostPose = { lift: number; turn: number; pitch: number }
export const FRONT: GhostPose = { lift: 0, turn: 0, pitch: 0 }
export function facing(dx: number, dy: number) {
  const length = Math.hypot(dx, dy)
  return length ? { turn: dx / length, pitch: dy / length } : { turn: 0, pitch: 0 }
}

/** One bounded entry per current agent; shared frame clock, no timers or DOM work. */
export function ghostMotion() {
  const agents = new Map<string, { profile: ReturnType<typeof hoverProfile>; pose: GhostPose }>()
  return {
    sync(ids: readonly string[]) {
      const present = new Set(ids)
      for (const id of agents.keys()) if (!present.has(id)) agents.delete(id)
      for (const id of ids) if (!agents.has(id)) agents.set(id, { profile: hoverProfile(id), pose: { ...FRONT } })
    },
    sample(id: string, elapsed: number, dt: number, reduced: boolean, dx = 0, dy = 0): GhostPose {
      const entry = agents.get(id)
      if (!entry) return FRONT
      const { profile, pose } = entry
      const target = facing(dx, dy)
      const blend = 1 - Math.exp(-Math.max(0, dt) / 0.18)
      pose.turn = reduced ? 0 : pose.turn + (target.turn - pose.turn) * blend
      pose.pitch = reduced ? 0 : pose.pitch + (target.pitch - pose.pitch) * blend
      pose.lift = reduced ? 0 : Math.sin(elapsed * Math.PI * 2 / profile.period + profile.phase) * profile.amplitude
      return pose
    },
  }
}
