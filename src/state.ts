import { seatPosition } from './layout.ts'
import type { Identity } from './identity.ts'
/** Desk placement belongs to the office; identity is supplied separately by the server. */
export const ROLES = Object.freeze(([
  Object.freeze({ id: 'orchestrator', name: 'Orchestrator', palette: 0, color: '#4488cc', desk: '01' }),
  Object.freeze({ id: 'developer', name: 'Developer', palette: 1, color: '#cc4444', desk: '02' }),
  Object.freeze({ id: 'browser-qa', name: 'Browser QA', palette: 2, color: '#44aa66', desk: '03' }),
  Object.freeze({ id: 'reviewer', name: 'Reviewer', palette: 3, color: '#aa55cc', desk: '04' }),
] as const).map((role, index) => Object.freeze({ ...role, ...seatPosition(index) })))
export type RoleId = typeof ROLES[number]['id']
export type Activity = 'idle' | 'working'
export type RosterAgent = Readonly<{ id: string; name: string; role: string; title?: string; status: string; activity: Activity; specialist?: RoleId; appearance?: Identity['appearance']; avatarUrl?: string }>
export type VisualAgent = { readonly id: string; readonly name: string; readonly palette: number; readonly color: string; readonly col: number; readonly row: number; readonly desk: string; readonly specialist?: RoleId; readonly status?: string; readonly activity: Activity; readonly identity?: Identity }
export type VisualState = readonly VisualAgent[]
export type DemoMode = 'mixed' | 'idle' | 'working'

/** Legacy/demo activity contract: { [roleId]: 'idle' | 'working' }. Fail closed to idle.
 * Only own properties and known role IDs are consumed. No transport or API here.
 */
export function mapVisualState(snapshot: unknown, identities?: Partial<Record<RoleId, Identity>>): VisualState {
  const values = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown> : {}
  return Object.freeze(ROLES.map(role => Object.freeze({
    ...role,
    ...(identities?.[role.id] ? { identity: identities[role.id] } : {}),
    activity: Object.hasOwn(values, role.id) && values[role.id] === 'working' ? 'working' : 'idle',
  })))
}

/** Explicit offline demo; live rosters use rosterLayout instead. */
export function demoSnapshot(mode: DemoMode): Record<RoleId, Activity> {
  return Object.fromEntries(ROLES.map((role, index) => [role.id,
    mode === 'working' || (mode === 'mixed' && index < 2) ? 'working' : 'idle',
  ])) as Record<RoleId, Activity>
}

/** Sorted IDs allocate the lowest free seat. Session reservations keep returning agents stable across partial polls. */
export function rosterLayout() {
  const slots = new Map<string, number>()
  return (agents: readonly RosterAgent[]): VisualState => {
    const occupied = new Set(slots.values())
    for (const agent of [...agents].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      if (!slots.has(agent.id)) {
        let slot = 0
        while (occupied.has(slot)) slot++
        slots.set(agent.id, slot); occupied.add(slot)
      }
    }
    return Object.freeze(agents.map(agent => {
      const specialist = ROLES.find(r => r.id === agent.specialist)
      const slot = slots.get(agent.id)!
      return Object.freeze({ id: agent.id, name: agent.name, specialist: agent.specialist,
        palette: specialist?.palette ?? 0, color: specialist?.color ?? '#c6ced4',
        ...seatPosition(slot),
        desk: String(slot + 1).padStart(2, '0'), activity: agent.activity, status: agent.status,
        identity: { name: agent.name, role: agent.title || agent.role, appearance: agent.appearance, avatarUrl: agent.avatarUrl },
      })
    }).sort((a, b) => a.row - b.row || a.col - b.col))
  }
}
