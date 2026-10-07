import { PALETTES, identityText, type Identity, type PaletteId } from './identity'
import { handoffTracker, type Handoff, type Task } from './handoff'
import { ROLES, type Activity, type RoleId } from './state'
export type OfficeSnapshot = { mode: 'demo' | 'live'; snapshot: Record<RoleId, Activity>; identities?: Partial<Record<RoleId, Identity>>; tasks?: Task[] | null }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
export function parseSnapshot(value: unknown): OfficeSnapshot {
  if (!isPlainObject(value) || !Object.hasOwn(value, 'mode') || !Object.hasOwn(value, 'snapshot') ||
      (value.mode !== 'live' && value.mode !== 'demo') || !isPlainObject(value.snapshot)) throw new Error('Invalid office state')
  const snapshot = value.snapshot
  if (ROLES.some(r => !Object.hasOwn(snapshot, r.id) || !['idle', 'working'].includes(snapshot[r.id] as string))) throw new Error('Invalid office state')
  const result: OfficeSnapshot = {
    mode: value.mode,
    snapshot: Object.fromEntries(ROLES.map(r => [r.id, snapshot[r.id]])) as Record<RoleId, Activity>,
  }
  if (Object.hasOwn(value, 'identities')) {
    if (!isPlainObject(value.identities)) throw new Error('Invalid identities')
    result.identities = {}
    for (const role of ROLES) {
      const identity = value.identities[role.id]
      if (!isPlainObject(identity) || typeof identity.name !== 'string' || typeof identity.role !== 'string') throw new Error('Invalid identity')
      if (identity.paletteId !== undefined && (typeof identity.paletteId !== 'string' || !Object.hasOwn(PALETTES, identity.paletteId))) throw new Error('Invalid palette')
      result.identities[role.id] = Object.freeze({ name: identityText(identity.name, role.name), role: identityText(identity.role, role.name), ...(identity.paletteId ? { paletteId: identity.paletteId as PaletteId } : {}) })
    }
  }
  if (Object.hasOwn(value, 'tasks')) {
    if (value.tasks == null) result.tasks = value.tasks
    else {
      if (!Array.isArray(value.tasks)) throw new Error('Invalid tasks')
      result.tasks = Array.from(value.tasks, task => {
        if (!isPlainObject(task) || !Object.hasOwn(task, 'taskId') || !Object.hasOwn(task, 'title') ||
            typeof task.taskId !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(task.taskId) || task.taskId.length > 32 ||
            typeof task.title !== 'string' || task.title.length > 80) throw new Error('Invalid tasks')
        if (task.target !== undefined && task.target !== 'developer' && task.target !== 'browser-qa') throw new Error('Invalid target')
        if (task.sha !== undefined && (task.target !== 'browser-qa' || typeof task.sha !== 'string' || !/^[a-f0-9]{40}$/.test(task.sha))) throw new Error('Invalid SHA')
        return { taskId: task.taskId, title: task.title, ...(task.target ? { target: task.target } : {}), ...(task.sha ? { sha: task.sha as string } : {}) }
      })
    }
  }
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
    const timeout = setTimeout(() => controller?.abort(), 7000)
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
