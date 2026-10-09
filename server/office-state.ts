import { createGithubReader, loadDeliveries } from './pipeline.ts'
import { demoDeliveries, type Delivery } from '../src/pipeline.ts'
import { appearancePalette, identityText, type Identity } from '../src/identity.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROLES, demoSnapshot, type Activity, type RoleId } from '../src/state.ts'

import type { Task } from '../src/handoff.ts'

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

// Paperclip supports at most 1000 issues per list read. A full page may be truncated.
export const ISSUE_LIMIT = 1000

type Config = { mode: 'live' | 'demo'; url?: string; company?: string; key?: string; ids?: Record<RoleId, string> }
export function readConfig(env: NodeJS.ProcessEnv): Config {
  if (env.OFFICE_MODE === 'demo') return { mode: 'demo' }
  if (env.OFFICE_MODE && env.OFFICE_MODE !== 'live') throw new Error('Invalid mode')
  const url = new URL(env.PAPERCLIP_API_URL || '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid URL')
  const ids = JSON.parse(env.PAPERCLIP_AGENT_ROLES || '{}') as Record<RoleId, string>
  if (!ids || ROLES.some(r => typeof ids[r.id] !== 'string' || !ids[r.id].trim()) || new Set(ROLES.map(r => ids[r.id])).size !== 4) throw new Error('Invalid mapping')
  if (!env.PAPERCLIP_COMPANY_ID || !env.PAPERCLIP_API_KEY) throw new Error('Missing configuration')
  return { mode: 'live', url: url.href.replace(/\/$/, ''), company: env.PAPERCLIP_COMPANY_ID, key: env.PAPERCLIP_API_KEY, ids }
}

export function mapAgents(input: unknown, ids: Record<RoleId, string>): Record<RoleId, Activity> {
  if (!Array.isArray(input)) throw new Error('Invalid upstream response')
  return Object.fromEntries(ROLES.map(role => {
    const matches = input.filter(a => a && typeof a === 'object' && a.id === ids[role.id])
    // Missing/duplicate mapped agents indicate a stale mapping, not a healthy idle agent.
    if (matches.length !== 1 || typeof matches[0].status !== 'string' || !matches[0].status) throw new Error('Invalid mapped agent')
    return [role.id, matches[0].status === 'running' ? 'working' : 'idle']
  })) as Record<RoleId, Activity>
}

export function mapIdentities(input: unknown, ids: Record<RoleId, string>): Record<RoleId, Identity> {
  mapAgents(input, ids) // Same strict mapping boundary as activity.
  const agents = input as Record<string, unknown>[]
  return Object.fromEntries(ROLES.map(role => {
    const agent = agents.find(a => a.id === ids[role.id])!
    const paletteId = appearancePalette(agent.appearance)
    return [role.id, { name: identityText(agent.name, role.name), role: identityText(agent.role, role.name), ...(paletteId ? { paletteId } : {}) }]
  })) as Record<RoleId, Identity>
}
export const demoIdentities = Object.fromEntries(ROLES.map((role, i) => [role.id, {
  name: role.name, role: role.name, paletteId: ['bubblegum-sky', 'tangerine-cobalt', 'lime-lagoon', 'violet-ember'][i],
}]))

export function officeMiddleware(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch, now = Date.now) {
  const github = createGithubReader(fetcher, env.OFFICE_GITHUB_TOKEN, now)
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split('?')[0] !== '/api/office-state') return next()
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
      let snapshot = demoSnapshot('mixed')
      let identities: unknown = demoIdentities
      let tasks: Task[] | null = null
      let deliveries: Delivery[] | null = config.mode === 'demo' ? demoDeliveries : null
      if (config.mode === 'live') {
        const upstream = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/agents`, {
          method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(2500), redirect: 'error',
        })
        if (!upstream.ok) throw new Error('Upstream unavailable')
        const agents: unknown = await upstream.json()
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
      res.end(JSON.stringify({ mode: config.mode, snapshot, identities, tasks, deliveries }))
    } catch {
      res.statusCode = 503
      res.end(JSON.stringify({ error: 'Office state unavailable' }))
    }
  }
}
