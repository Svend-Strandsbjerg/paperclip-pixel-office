/** Visual-only payload: no Paperclip identities or activity overrides. */
export type Destination = 'developer' | 'browser-qa' | 'reviewer'
export type Task = { taskId: string; title: string; target?: Destination; sha?: string; context?: 'rework' }
export type Completion = { taskId: string; title: string; agentId: string; status: 'done' | 'open' }
export type Handoff = Omit<Task, 'target'> & { source: string; target: string; kind?: 'result' }
export const demoHandoff: Handoff = { source: 'orchestrator', target: 'developer', taskId: 'DEMO-1', title: 'Build the next office feature' }
export const demoQaHandoff: Handoff = { source: 'orchestrator', target: 'browser-qa', taskId: 'DEMO-2', title: 'Test the implementation', sha: 'abc1234abc1234abc1234abc1234abc1234abc1234a' }
export const demoReviewerHandoff: Handoff = { source: 'orchestrator', target: 'reviewer', taskId: 'DEMO-3', title: 'Review the implementation', sha: 'abc1234abc1234abc1234abc1234abc1234abc1234a' }
export const demoReworkHandoff: Handoff = { source: 'orchestrator', target: 'developer', context: 'rework', taskId: 'DEMO-4', title: 'Address QA findings', sha: 'abc1234abc1234abc1234abc1234abc1234abc1234a' }
export const SEEN_LIMIT = 10000
export function handoffTracker() {
  let previous: Set<string> | undefined
  const seen = new Set<string>()
  let saturated = false
  return (tasks: Task[] | null): Handoff[] => {
    if (tasks === null) { previous = undefined; return [] }
    if (saturated) return []
    const key = (t: Task) => `${t.target ?? 'developer'}:${t.taskId}`
    const current = new Set(tasks.map(key))
    const events = previous ? tasks.filter(t => !previous!.has(key(t)) && !seen.has(key(t))).map(t => ({ ...t, source: 'orchestrator' as const, target: t.target ?? 'developer' as const })) : []
    for (const id of current) {
      if (!seen.has(id) && seen.size === SEEN_LIMIT) {
        // Fail quiet rather than evicting IDs and replaying old assignments.
        saturated = true
        previous = undefined
        return []
      }
      seen.add(id)
    }
    previous = current
    return events
  }
}

export const WALK_SECONDS = 4
export const BUBBLE_SECONDS = 3
export const HANDOFF_SECONDS = WALK_SECONDS * 2 + BUBBLE_SECONDS
// Keep recent context without replaying a backlog. Times are monotonic milliseconds.
export const PENDING_LIMIT = 2
export const MAX_WAIT_MS = 12000
export function handoffQueue() {
  let pending: { event: Handoff; received: number }[] = []
  let active: { event: Handoff; started: number } | undefined
  return {
    push(event: Handoff, now: number) {
      pending.push({ event, received: now })
      if (pending.length > PENDING_LIMIT) pending.shift()
    },
    clear() { pending = []; active = undefined },
    advance(now: number, reducedMotion: boolean) {
      pending = pending.filter(item => now - item.received < MAX_WAIT_MS)
      const duration = (reducedMotion ? BUBBLE_SECONDS : HANDOFF_SECONDS) * 1000
      if (active && now - active.started >= duration) active = undefined
      if (!active && pending.length) active = { event: pending.shift()!.event, started: now }
      return active ? { event: active.event, seconds: (now - active.started) / 1000 } : undefined
    },
  }
}

/** Only an observed authoritative open -> done transition produces a result.
 * Initial load/reconnect, disappearance, idle and text changes never do. */
export function completionTracker() {
  let previous: Map<string, Completion> | undefined
  const seen = new Set<string>()
  let saturated = false
  return (tasks: Completion[] | null): Handoff[] => {
    if (tasks === null) { previous = undefined; return [] }
    if (saturated) return []
    const events: Handoff[] = []
    for (const task of tasks) {
      const before = previous?.get(task.taskId)
      if (task.status === 'done' && !seen.has(task.taskId)) {
        if (seen.size >= SEEN_LIMIT) { saturated = true; previous = undefined; return [] }
        seen.add(task.taskId)
        if (before?.status === 'open' && before.agentId === task.agentId) events.push({ taskId: task.taskId, title: task.title, source: task.agentId, target: 'orchestrator', kind: 'result' })
      }
    }
    previous = new Map(tasks.map(t => [t.taskId, t]))
    return events
  }
}

/** Fixed office aisles also serve future desks on expanded rows. */
export function deliveryPose(seconds: number, source: { col: number; row: number }, target: { col: number; row: number }) {
  // The left row-12 seat exits beside its desk before passing above the plant.
  const aisle = (seat: { col: number; row: number }) => seat.col < 12 && seat.row === 12
    ? [[144, 200], [144, 176], [216, 176]]
    : [[216, seat.row * 16 + 8]]
  const points = [[source.col * 16 + 8, source.row * 16 + 8], ...aisle(source), ...aisle(target).reverse(), [target.col * 16 + 8 + (target.col < 12 ? 24 : -24), target.row * 16 + 8]]
  const returning = seconds >= WALK_SECONDS + BUBBLE_SECONDS
  const phase = seconds < WALK_SECONDS ? 'outbound' : returning ? 'returning' : 'bubble'
  const progress = phase === 'bubble' ? 1 : Math.min(1, Math.max(0, (seconds - (returning ? WALK_SECONDS + BUBBLE_SECONDS : 0)) / WALK_SECONDS))
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]))
  let distance = lengths.reduce((a, b) => a + b, 0) * (returning ? 1 - progress : progress)
  for (let i = 0; i < lengths.length; i++) {
    if (!lengths[i]) continue
    if (distance <= lengths[i] || i === lengths.length - 1) {
      const [x, y] = points[i], [tx, ty] = points[i + 1]
      return { phase, x: x + (tx - x) * distance / lengths[i], y: y + (ty - y) * distance / lengths[i], dx: phase === 'bubble' ? 0 : (tx - x) * (returning ? -1 : 1), dy: phase === 'bubble' ? 0 : (ty - y) * (returning ? -1 : 1), carrying: !returning }
    }
    distance -= lengths[i]
  }
  return { phase, x: points[0][0], y: points[0][1], dx: 0, dy: 0, carrying: !returning }
}
