/** Visual-only payload: no Paperclip identities or activity overrides. */
export type Task = { taskId: string; title: string }
export type Handoff = Task & { source: 'orchestrator'; target: 'developer' }
export const demoHandoff: Handoff = { source: 'orchestrator', target: 'developer', taskId: 'DEMO-1', title: 'Build the next office feature' }
export function handoffTracker() {
  let previous: Set<string> | undefined
  const seen = new Set<string>()
  return (tasks: Task[] | null): Handoff[] => {
    if (tasks === null) { previous = undefined; return [] }
    const current = new Set(tasks.map(t => t.taskId))
    const events = previous ? tasks.filter(t => !previous!.has(t.taskId) && !seen.has(t.taskId)).map(t => ({ ...t, source: 'orchestrator' as const, target: 'developer' as const })) : []
    for (const id of current) seen.add(id)
    previous = current
    return events
  }
}

// The extracted foundation has no movement updater. This one fixed route uses
// its WALK frames/directions, along the open aisle above the permanent desks.
const route = [[6, 6], [6, 5], [16, 5], [16, 6]] as const
export const WALK_SECONDS = 4
export const BUBBLE_SECONDS = 3
export const HANDOFF_SECONDS = WALK_SECONDS * 2 + BUBBLE_SECONDS
export function handoffPose(seconds: number) {
  const returning = seconds >= WALK_SECONDS + BUBBLE_SECONDS
  const phase = seconds < WALK_SECONDS ? 'outbound' : returning ? 'returning' : 'bubble'
  const progress = phase === 'bubble' ? 1 : Math.min(1, Math.max(0, (returning ? seconds - WALK_SECONDS - BUBBLE_SECONDS : seconds) / WALK_SECONDS))
  const distance = (returning ? 1 - progress : progress) * 12
  let remaining = distance
  for (let i = 1; i < route.length; i++) {
    const [x, y] = route[i - 1], [tx, ty] = route[i]
    const length = Math.abs(tx - x) + Math.abs(ty - y)
    if (remaining <= length || i === route.length - 1) {
      const fraction = remaining / length
      return { phase, x: (x + (tx - x) * fraction) * 16 + 8, y: (y + (ty - y) * fraction) * 16 + 8,
        dx: (tx - x) * (returning ? -1 : 1), dy: (ty - y) * (returning ? -1 : 1) }
    }
    remaining -= length
  }
  throw new Error('Invalid route')
}
