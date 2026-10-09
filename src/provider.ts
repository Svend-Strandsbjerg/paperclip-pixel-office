import { parseDeliveries } from './pipeline-view'
import type { Delivery } from './pipeline'
import { normalizeAppearance, normalizeAvatarUrl, identityText, type Identity } from './identity'
import { handoffTracker, type Handoff, type Task } from './handoff'
import { ROLES, type Activity, type RoleId, type RosterAgent } from './state'
export type OfficeSnapshot = { mode: 'demo' | 'live'; snapshot: Record<string, Activity>; agents?: RosterAgent[]; identities?: Record<string, Identity>; tasks?: Task[] | null; deliveries?: Delivery[] | null }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
export function parseSnapshot(value: unknown): OfficeSnapshot {
  if (!isPlainObject(value) || !Object.hasOwn(value, 'mode') || !Object.hasOwn(value, 'snapshot') ||
      (value.mode !== 'live' && value.mode !== 'demo') || !isPlainObject(value.snapshot)) throw new Error('Invalid office state')
  const snapshot = value.snapshot
  if (Object.values(snapshot).some(activity => !['idle', 'working'].includes(activity as string))) throw new Error('Invalid office state')
  const result: OfficeSnapshot = {
    mode: value.mode,
    snapshot: Object.fromEntries(Object.entries(snapshot)) as Record<string, Activity>,
  }
  if (Object.hasOwn(value, 'identities')) {
    if (!isPlainObject(value.identities)) throw new Error('Invalid identities')
    result.identities = {}
    for (const id of Object.keys(snapshot)) {
      const identity = value.identities[id]
      if (!isPlainObject(identity) || typeof identity.name !== 'string' || typeof identity.role !== 'string') throw new Error('Invalid identity')
      const appearance = normalizeAppearance(identity.appearance);
      (result.identities as Record<string, Identity>)[id] = Object.freeze({ name: identityText(identity.name, 'Unnamed agent'), role: identityText(identity.role, 'Agent'), ...(appearance ? { appearance } : {}), ...(normalizeAvatarUrl(identity.avatarUrl) ? { avatarUrl: normalizeAvatarUrl(identity.avatarUrl) } : {}) })
    }
  }
  if (Object.hasOwn(value, 'agents')) {
    if (!Array.isArray(value.agents)) throw new Error('Invalid roster')
    const ids = new Set<string>(), specialists = new Set<string>()
    result.agents = value.agents.map(agent => {
      if (!isPlainObject(agent) || typeof agent.id !== 'string' || !agent.id || ids.has(agent.id) ||
          typeof agent.name !== 'string' || typeof agent.role !== 'string' || typeof agent.status !== 'string' ||
          !['idle', 'working'].includes(agent.activity as string)) throw new Error('Invalid agent')
      ids.add(agent.id)
      if (agent.specialist !== undefined && (!ROLES.some(r => r.id === agent.specialist) || specialists.has(agent.specialist as string))) throw new Error('Invalid specialist')
      if (agent.specialist) specialists.add(agent.specialist as string)
      return { id: agent.id, name: identityText(agent.name, 'Unnamed agent'), role: identityText(agent.role, 'Agent'),
        ...(typeof agent.title === 'string' ? { title: identityText(agent.title, 'Agent') } : {}),
        status: identityText(agent.status, 'unknown'), activity: agent.activity as Activity,
        specialist: agent.specialist as RoleId | undefined, appearance: normalizeAppearance(agent.appearance), avatarUrl: normalizeAvatarUrl(agent.avatarUrl) }
    })
  }
  if (Object.hasOwn(value, 'tasks')) {
    if (value.tasks == null) result.tasks = value.tasks
    else {
      if (!Array.isArray(value.tasks)) throw new Error('Invalid tasks')
      result.tasks = Array.from(value.tasks, task => {
        if (!isPlainObject(task) || !Object.hasOwn(task, 'taskId') || !Object.hasOwn(task, 'title') ||
            typeof task.taskId !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(task.taskId) || task.taskId.length > 32 ||
            typeof task.title !== 'string' || task.title.length > 80) throw new Error('Invalid tasks')
        if (task.target !== undefined && task.target !== 'developer' && task.target !== 'browser-qa' && task.target !== 'reviewer') throw new Error('Invalid target')
        if (task.context !== undefined && (task.context !== 'rework' || task.target !== 'developer')) throw new Error('Invalid context')
        if (task.sha !== undefined && ((task.target !== 'browser-qa' && task.target !== 'reviewer' && task.context !== 'rework') || typeof task.sha !== 'string' || !/^[a-f0-9]{40}$/.test(task.sha))) throw new Error('Invalid SHA')
        return { taskId: task.taskId, title: task.title, ...(task.target ? { target: task.target } : {}), ...(task.sha ? { sha: task.sha as string } : {}), ...(task.context === 'rework' ? { context: 'rework' as const } : {}) }
      })
    }
  }
  if (Object.hasOwn(value, 'deliveries')) result.deliveries = parseDeliveries(value.deliveries)
  return result
}
/** Serial polling: no overlapping requests; retain the last valid state on failure. */
export function pollOffice(onState: (data: OfficeSnapshot) => void, onFailure: () => void, onHandoff: (event: Handoff) => void = () => {}) {
  const track = handoffTracker()
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  let controller: AbortController | undefined
  async function tick() {
    controller = new AbortController()
    const timeout = setTimeout(() => controller?.abort(), 11000)
    try {
      const response = await fetch('/api/office-state', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('Unavailable')
      const data = parseSnapshot(await response.json())
      if (!stopped) {
        onState(data)
        for (const event of track(data.mode === 'live' ? data.tasks ?? null : null)) onHandoff(event)
      }
      if (data.mode === 'demo') stopped = true
    } catch { track(null); if (!stopped) onFailure() }
    finally {
      clearTimeout(timeout)
      if (!stopped) timer = setTimeout(tick, 1500)
    }
  }
  void tick()
  return () => { stopped = true; clearTimeout(timer); controller?.abort() }
}
