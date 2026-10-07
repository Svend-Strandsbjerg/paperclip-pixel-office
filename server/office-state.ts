import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROLES, demoSnapshot, type Activity, type RoleId } from '../src/state.ts'

import type { Task } from '../src/handoff.ts'

/** Parent must belong to the configured Orchestrator; unrelated work is excluded. */
export function mapTasks(input: unknown, ids: Record<RoleId, string>): Task[] {
  if (!Array.isArray(input) || input.some(i => !i || typeof i.id !== 'string' || typeof i.title !== 'string')) throw new Error('Invalid issues')
  const parents = new Set(input.filter(i => i.assigneeAgentId === ids.orchestrator).map(i => i.id))
  return input.filter(i => parents.has(i.parentId) && i.assigneeAgentId === ids.developer &&
    typeof i.identifier === 'string' && /^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(i.identifier) && i.identifier.length <= 32)
    .map(i => ({ taskId: i.identifier, title: i.title.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) }))
    .sort((a, b) => a.taskId.localeCompare(b.taskId))
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

export function officeMiddleware(env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch) {
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
      let tasks: Task[] | null = null
      if (config.mode === 'live') {
        const upstream = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/agents`, {
          method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(5000), redirect: 'error',
        })
        if (!upstream.ok) throw new Error('Upstream unavailable')
        snapshot = mapAgents(await upstream.json(), config.ids!)
        // Independent failure boundary: issue reads must never hide agent activity.
        let issueFailure = 'request failed or timed out'
        try {
          const issues = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/issues?limit=${ISSUE_LIMIT}`, {
            method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
            signal: AbortSignal.timeout(1500), redirect: 'error',
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
        } catch {
          tasks = null
          // Fixed categories only: no credentials, issue data, URLs or raw upstream errors.
          console.warn(`[office-state] Issue read failed: ${issueFailure}; task handoffs unavailable, agent activity retained`)
        }
      }
      res.end(JSON.stringify({ mode: config.mode, snapshot, tasks }))
    } catch {
      res.statusCode = 503
      res.end(JSON.stringify({ error: 'Office state unavailable' }))
    }
  }
}
