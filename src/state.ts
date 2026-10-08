import type { Identity } from './identity.ts'
/** Desk placement belongs to the office; identity is supplied separately by the server. */
export const ROLES = Object.freeze([
  Object.freeze({ id: 'orchestrator', name: 'Orchestrator', palette: 0, color: '#4488cc', col: 6, row: 6, desk: '01' }),
  Object.freeze({ id: 'developer', name: 'Developer', palette: 1, color: '#cc4444', col: 17, row: 6, desk: '02' }),
  Object.freeze({ id: 'browser-qa', name: 'Browser QA', palette: 2, color: '#44aa66', col: 6, row: 12, desk: '03' }),
  Object.freeze({ id: 'reviewer', name: 'Reviewer', palette: 3, color: '#aa55cc', col: 17, row: 12, desk: '04' }),
] as const)
export type RoleId = typeof ROLES[number]['id']
export type Activity = 'idle' | 'working'
export type VisualAgent = typeof ROLES[number] & { readonly activity: Activity; readonly identity?: Identity }
export type VisualState = readonly VisualAgent[]
export type DemoMode = 'mixed' | 'idle' | 'working'

/** External contract: { [roleId]: 'idle' | 'working' }. Fail closed to idle.
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

/** Local fixtures exercise the same mapping boundary as a future external provider. */
export function demoSnapshot(mode: DemoMode): Record<RoleId, Activity> {
  return Object.fromEntries(ROLES.map((role, index) => [role.id,
    mode === 'working' || (mode === 'mixed' && index < 2) ? 'working' : 'idle',
  ])) as Record<RoleId, Activity>
}
