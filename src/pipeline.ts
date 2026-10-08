export const STAGES = ['developer', 'browser-qa', 'reviewer'] as const
export type Stage = typeof STAGES[number]
export type GateState = 'waiting' | 'active' | 'valid' | 'invalidated' | 'rework' | 'unknown'
export type Gate = { role: Stage; state: GateState; task?: string; sha?: string }
export type PullRequest = { repository: string; number: number; url: string; branch: string; base: string; head: string; state: 'open' | 'closed' | 'merged' }
export type Delivery = { issue: string; title: string; status: string; gates: Gate[]; pr?: PullRequest; merge: 'waiting' | 'ready' | 'merged'; notice: string }
export const exactSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
export const demoDeliveries: Delivery[] = [{ issue: 'DEMO-1', title: 'A little space for the next delivery', status: 'in_progress', gates: STAGES.map(role => ({ role, state: 'valid', sha: 'a'.repeat(40) })), pr: { repository: 'demo/pixel-office', number: 1, url: 'https://github.com/demo/pixel-office/pull/1', branch: 'demo-delivery', base: 'main', head: 'a'.repeat(40), state: 'open' }, merge: 'ready', notice: 'Illustrative demo • Human merge only' }]
