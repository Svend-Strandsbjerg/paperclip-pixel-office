import { ROLES, type Activity, type RoleId } from './state'
export type OfficeSnapshot = { mode: 'demo' | 'live'; snapshot: Record<RoleId, Activity> }
export function parseSnapshot(value: unknown): OfficeSnapshot {
  const data = value as OfficeSnapshot | null
  if (!data || !['live', 'demo'].includes(data.mode) || !data.snapshot ||
      ROLES.some(r => !Object.hasOwn(data.snapshot, r.id) || !['idle', 'working'].includes(data.snapshot[r.id]))) throw new Error('Invalid office state')
  return data
}
/** Serial polling: no overlapping requests; retain the last valid state on failure. */
export function pollOffice(onState: (data: OfficeSnapshot) => void, onFailure: () => void) {
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
      if (!stopped) onState(data)
      if (data.mode === 'demo') stopped = true
    } catch { if (!stopped) onFailure() }
    finally {
      clearTimeout(timeout)
      if (!stopped) timer = setTimeout(tick, 1500)
    }
  }
  void tick()
  return () => { stopped = true; clearTimeout(timer); controller?.abort() }
}
