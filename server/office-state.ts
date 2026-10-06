import type { IncomingMessage, ServerResponse } from 'node:http'
import { ROLES, demoSnapshot, type Activity, type RoleId } from '../src/state.ts'

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
      if (config.mode === 'live') {
        const upstream = await fetcher(`${config.url}/api/companies/${encodeURIComponent(config.company!)}/agents`, {
          method: 'GET', headers: { Authorization: `Bearer ${config.key}` },
          signal: AbortSignal.timeout(5000), redirect: 'error',
        })
        if (!upstream.ok) throw new Error('Upstream unavailable')
        snapshot = mapAgents(await upstream.json(), config.ids!)
      }
      res.end(JSON.stringify({ mode: config.mode, snapshot }))
    } catch {
      res.statusCode = 503
      res.end(JSON.stringify({ error: 'Office state unavailable' }))
    }
  }
}
