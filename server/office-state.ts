import { avatarMiddleware } from './avatars.ts'
import { createGithubReader, loadDeliveries } from './pipeline.ts'
import { demoDeliveries, type Delivery } from '../src/pipeline.ts'
import { normalizeAppearance, normalizeAvatarUrl, identityText, type Identity } from '../src/identity.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROLES, demoSnapshot, type Activity, type RoleId, type RosterAgent } from '../src/state.ts'

import type { Completion, Task } from '../src/handoff.ts'

/** Only explicit exact-SHA labels in the authoritative QA/review assignment are used.
 * Conflicting labels, abbreviated hashes and incidental commit mentions stay absent. */
export function qaSha(description: unknown): string | undefined {
  if (typeof description !== 'string') return undefined
  const values = [...description.matchAll(/^\s*(?:-\s*)?(?:Exact SHA(?: to (?:test|review))?|Required exact SHA(?: to review)?|Exact required PR head SHA|Required tested SHA|Exact PR head SHA(?: to (?:test|review))?|Immutable SHA to test):([^\n\r]*)$/gim)].map(m => m[1].trim())
  if (!values.length || values.some(v => !/^(?:[a-f0-9]{40}|`[a-f0-9]{40}`)$/i.test(v))) return undefined
  const hashes = values.map(v => v.replaceAll('`', '').toLowerCase())
  return new Set(hashes).size === 1 ? hashes[0] : undefined
}

/** Parent must belong to the configured Orchestrator; unrelated work is excluded. */
export function mapTasks(input: unknown, ids: Record<RoleId, string>): Task[] {
  if (!Array.isArray(input)) throw new Error('Invalid issues')
  const items = input.filter(i => i && typeof i.id === 'string')
  const parents = new Set(items.filter(i => i.assigneeAgentId === ids.orchestrator).map(i => i.id))
  const completedFlows = new Set(items.filter(i => i.assigneeAgentId === ids.developer && i.status === 'done' && parents.has(i.parentId)).map(i => i.parentId))
  // A Reviewer assignment is the Orchestrator's workflow decision; completion is
  // checked directly, but no verdict is inferred from free text or agent activity.
  const reviewedFlows = new Set(items.filter(i => i.assigneeAgentId === ids['browser-qa'] && i.status === 'done' && completedFlows.has(i.parentId)).map(i => i.parentId))
  return items.filter(i => typeof i.title === 'string' && parents.has(i.parentId) && (i.assigneeAgentId === ids.developer || (i.assigneeAgentId === ids['browser-qa'] && completedFlows.has(i.parentId)) || (i.assigneeAgentId === ids.reviewer && reviewedFlows.has(i.parentId))) &&
    typeof i.identifier === 'string' && /^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(i.identifier) && i.identifier.length <= 32)
    .map(i => {
      const qa = i.assigneeAgentId === ids['browser-qa']
      const reviewer = i.assigneeAgentId === ids.reviewer
      // No assignment timestamp is exposed by the issue list. Use creation and
      // completion timestamps, never updatedAt (which changes on title/status edits).
      const time = (value: unknown) => typeof value === 'string' ? Date.parse(value) : NaN
      const siblings = items.filter(s => s.parentId === i.parentId && s.id !== i.id)
      const rework = i.assigneeAgentId === ids.developer && siblings.some(q =>
        q.assigneeAgentId === ids['browser-qa'] && q.status === 'done' &&
        time(q.createdAt) <= time(q.completedAt) && time(q.completedAt) < time(i.createdAt) &&
        siblings.some(d => d.assigneeAgentId === ids.developer && d.status === 'done' &&
          time(d.createdAt) <= time(d.completedAt) && time(d.completedAt) < time(q.createdAt)) &&
        // Other QA siblings must be provably outside this cycle. Equal creation
        // times are ambiguous because assignment timestamps are unavailable.
        !siblings.some(later => later.id !== q.id && later.assigneeAgentId === ids['browser-qa'] &&
          (!Number.isFinite(time(later.createdAt)) ||
            (time(later.createdAt) >= time(q.createdAt) && time(later.createdAt) <= time(i.createdAt)))) &&
        // A subsequent Reviewer stage makes this an unsupported Reviewer return.
        !siblings.some(r => r.assigneeAgentId === ids.reviewer &&
          (!Number.isFinite(time(r.createdAt)) ||
            (time(r.createdAt) >= time(q.createdAt) && time(r.createdAt) <= time(i.createdAt)))))
      // Preserve QA/Reviewer extraction from available list text; rework requires
      // an untruncated description so unseen conflicting labels cannot qualify it.
      const sha = (qa || reviewer || (rework && !i.descriptionTruncated)) ? qaSha(i.description) : undefined
      return {
        taskId: i.identifier,
        title: i.title.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled task',
        ...(qa ? { target: 'browser-qa' as const } : reviewer ? { target: 'reviewer' as const } : {}),
        ...(rework ? { target: 'developer' as const, context: 'rework' as const } : {}),
        ...(sha ? { sha } : {}),
      }
    })
    .sort((a, b) => a.taskId.localeCompare(b.taskId, undefined, { numeric: true }))
}

/** Explicit child lifecycle only; roster membership permits future specialist roles. */
export function mapCompletions(input: unknown, orchestrator: string | undefined, roster: readonly RosterAgent[]): Completion[] {
  if (!Array.isArray(input)) throw new Error('Invalid issues')
  if (!orchestrator) return []
  const parents = new Set(input.filter(i => i && typeof i.id === 'string' && i.assigneeAgentId === orchestrator).map(i => i.id))
  const agents = new Set(roster.map(a => a.id))
  return input.filter(i => i && typeof i.parentId === 'string' && parents.has(i.parentId) && agents.has(i.assigneeAgentId) && i.assigneeAgentId !== orchestrator &&
    typeof i.identifier === 'string' && /^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(i.identifier) && i.identifier.length <= 32 && typeof i.title === 'string' &&
    ['todo', 'backlog', 'in_progress', 'in_review', 'blocked', 'done'].includes(i.status))
    .map(i => ({ taskId: i.identifier, title: i.title.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 80), agentId: i.assigneeAgentId, status: i.status === 'done' ? 'done' : 'open' }))
}

// Paperclip supports at most 1000 issues per list read. A full page may be truncated.
export const ISSUE_LIMIT = 1000

type Config = { mode: 'live' | 'demo'; url?: string; company?: string; key?: string; ids?: Record<RoleId, string> }
export function readConfig(env: NodeJS.ProcessEnv): Config {
  if (env.OFFICE_MODE === 'demo') return { mode: 'demo' }
  if (env.OFFICE_MODE && env.OFFICE_MODE !== 'live') throw new Error('Invalid mode')
  const url = new URL(env.PAPERCLIP_API_URL || '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid URL')
  const ids = JSON.parse(env.PAPERCLIP_AGENT_ROLES || '{}') as Record<RoleId, string>
  if (!ids || typeof ids !== 'object' || Array.isArray(ids) || Object.entries(ids).some(([role, id]) => !ROLES.some(r => r.id === role) || typeof id !== 'string' || !id.trim()) || new Set(Object.values(ids)).size !== Object.values(ids).length) throw new Error('Invalid mapping')
  if (!env.PAPERCLIP_COMPANY_ID || !env.PAPERCLIP_API_KEY) throw new Error('Missing configuration')
  return { mode: 'live', url: url.href.replace(/\/$/, ''), company: env.PAPERCLIP_COMPANY_ID, key: env.PAPERCLIP_API_KEY, ids }
}

/** Roster identity comes exclusively from the company agent list. Workflow mappings
 * annotate specialists; they neither filter nor manufacture visible agents. */
export function mapRoster(input: unknown, ids: Partial<Record<RoleId, string>> = {}): RosterAgent[] {
  if (!Array.isArray(input)) throw new Error('Invalid upstream response')
  const seen = new Set<string>()
  return input.map(agent => {
    if (!agent || typeof agent.id !== 'string' || !agent.id || seen.has(agent.id) || typeof agent.status !== 'string' || !agent.status) throw new Error('Invalid agent')
    seen.add(agent.id)
    const specialist = ROLES.find(r => ids[r.id] === agent.id)?.id
    const appearance = normalizeAppearance(agent.appearance)
    const avatarUrl = normalizeAvatarUrl(agent.avatarUrl)
    return { id: agent.id, name: identityText(agent.name, 'Unnamed agent'), role: identityText(agent.role, 'Agent'),
      ...(typeof agent.title === 'string' ? { title: identityText(agent.title, 'Agent') } : {}),
      status: identityText(agent.status, 'unknown'), activity: agent.status === 'running' ? 'working' : 'idle',
      ...(specialist ? { specialist } : {}), ...(appearance ? { appearance } : {}), ...(avatarUrl ? { avatarUrl } : {}),
    }
  })
}
export function mapAgents(input: unknown, ids: Partial<Record<RoleId, string>>): Record<string, Activity> {
  return Object.fromEntries(mapRoster(input, ids).map(a => [a.id, a.activity]))
}
export function mapIdentities(input: unknown, ids: Partial<Record<RoleId, string>>): Record<string, Identity> {
  return Object.fromEntries(mapRoster(input, ids).map(a => [a.id, { name: a.name, role: a.title || a.role,
    ...(a.appearance ? { appearance: a.appearance } : {}), ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}) }]))
}
export const demoIdentities = Object.fromEntries(ROLES.map(role => [role.id, {
  name: role.name, role: role.name,
}]))

export function officeMiddleware(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch, now = Date.now) {
  const avatars = avatarMiddleware(env, fetcher)
  const github = createGithubReader(fetcher, env.OFFICE_GITHUB_TOKEN, now)
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/office-state') return avatars(req, res, next)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('Allow', 'GET')
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }
    try {
      const config = readConfig(env)
      let snapshot: Record<string, Activity> = demoSnapshot('mixed')
      let roster: RosterAgent[] | undefined
      let identities: unknown = demoIdentities
      let tasks: Task[] | null = null
      let completions: Completion[] | null = null
      let deliveries: Delivery[] | null = config.mode === 'demo' ? demoDeliveries : null
      if (config.mode === 'live') {
        const upstream = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/agents`, {
          method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(2500), redirect: 'error',
        })
        if (!upstream.ok) throw new Error('Upstream unavailable')
        const agents: unknown = await upstream.json()
        roster = mapRoster(agents, config.ids!)
        snapshot = mapAgents(agents, config.ids!)
        identities = mapIdentities(agents, config.ids!)
        // Independent failure boundary: issue reads must never hide agent activity.
        let issueFailure = 'request failed or timed out'
        try {
          const issues = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/issues?limit=${ISSUE_LIMIT}`, {
            method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
            signal: AbortSignal.timeout(4000), redirect: 'error',
          })
          if (!issues.ok) {
            issueFailure = `HTTP ${issues.status}`
            throw new Error('Issues unavailable')
          }
          issueFailure = 'invalid issue response'
          const input: unknown = await issues.json()
          if (Array.isArray(input) && input.length >= ISSUE_LIMIT) {
            issueFailure = `issue limit ${ISSUE_LIMIT} reached; snapshot may be incomplete`
            throw new Error('Incomplete issues')
          }
          completions = mapCompletions(input, config.ids?.orchestrator, roster!)
          if (!ROLES.every(r => config.ids?.[r.id])) throw new Error('Workflow mapping unavailable')
          tasks = mapTasks(input, config.ids!)
          try {
            const deadline = AbortSignal.timeout(1500)
            deliveries = await loadDeliveries(input, config.ids!, async path => {
              deadline.throwIfAborted()
              const response = await fetcher(`${config.url}${path}`, { method: 'GET', headers: { Authorization: `Bearer ${config.key}` }, redirect: 'error', signal: deadline })
              if (!response.ok) throw new Error('Evidence unavailable')
              return response.json()
            }, fetcher, env.OFFICE_GITHUB_TOKEN, github)
          } catch { deliveries = null }
        } catch {
          tasks = null
          // Fixed categories only: no credentials, issue data, URLs or raw upstream errors.
          console.warn(`[office-state] Issue read failed: ${issueFailure}; task handoffs unavailable, agent activity retained`)
        }
      }
      res.end(JSON.stringify({ mode: config.mode, snapshot, identities, ...(roster ? { agents: roster } : {}), tasks, completions, deliveries }))
    } catch {
      res.statusCode = 503
      res.end(JSON.stringify({ error: 'Office state unavailable' }))
    }
  }
}
