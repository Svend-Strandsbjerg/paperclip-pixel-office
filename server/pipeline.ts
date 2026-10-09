import { STAGES, exactSha, type Delivery, type Gate, type PullRequest } from '../src/pipeline.ts'
import type { RoleId } from '../src/state.ts'
type Issue = { id: string; identifier: string; title: string; status: string; parentId?: string; projectId?: string; assigneeAgentId?: string; createdAt?: string; completedAt?: string }
type Product = { issueId?: string; type?: string; provider?: string; url?: string; metadata?: { delivery?: { sha?: string; outcome?: string } } }
export type Candidate = { parent: Issue; children: Issue[] }
const time = (v?: string) => v ? Date.parse(v) : NaN
const label = (v: string) => v.replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 120)
const issueKey = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]*-[0-9]+$/.test(v) && v.length <= 32
export function candidates(input: unknown, ids: Record<RoleId, string>): Candidate[] {
  if (!Array.isArray(input)) throw new Error('Invalid issues')
  const orchestrators = new Set(input.filter(i => i?.assigneeAgentId === ids.orchestrator).map(i => i.id))
  if (input.some(i => i && orchestrators.has(i.parentId) && STAGES.some(r => i.assigneeAgentId === ids[r]) && (typeof i.id !== 'string' || !issueKey(i.identifier) || typeof i.title !== 'string'))) throw new Error('Incomplete specialist identity')
  const items = input.filter((i): i is Issue => i && typeof i.id === 'string' && issueKey(i.identifier) && typeof i.title === 'string')
  if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('Duplicate issues')
  const children = new Map<string, Issue[]>()
  for (const i of items) if (i.parentId) {
    const siblings = children.get(i.parentId) || []
    siblings.push(i)
    children.set(i.parentId, siblings)
  }
  return items.filter(p => p.assigneeAgentId === ids.orchestrator && ['todo', 'in_progress', 'in_review', 'blocked'].includes(p.status))
    .map(parent => ({ parent, children: (children.get(parent.id) || []).filter(c => c.projectId === parent.projectId && STAGES.some(r => c.assigneeAgentId === ids[r])) }))
    .filter(c => c.children.some(i => i.assigneeAgentId === ids.developer))
    .sort((a, b) => a.parent.identifier.localeCompare(b.parent.identifier, 'en', { numeric: true }))
}
export function prIdentity(url: unknown): { repository: string; number: number; url: string } | undefined {
  if (typeof url !== 'string') return
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)\/pull\/([1-9][0-9]*)$/.exec(url)
  if (m && !['.', '..'].includes(m[1].split('/')[1]) && Number.isSafeInteger(Number(m[2]))) return { repository: m[1], number: Number(m[2]), url }
}
export function derive(candidate: Candidate, ids: Record<RoleId, string>, products: Map<string, Product[]>, pr?: PullRequest): Delivery {
  const gates: Gate[] = []
  let previous: Issue | undefined
  let chain = !!pr && pr.state === 'open'
  let rework = false
  for (const role of STAGES) {
    const issues = candidate.children.filter(i => i.assigneeAgentId === ids[role] && i.status !== 'cancelled').sort((a,b) => time(b.createdAt) - time(a.createdAt))
    const current = issues[0]
    const ambiguous = issues.some(i => !Number.isFinite(time(i.createdAt))) || issues.slice(1).some(i => i.status !== 'done' || !Number.isFinite(time(i.completedAt)) || time(i.completedAt) >= time(current?.createdAt)) || (issues.length > 1 && time(issues[0].createdAt) === time(issues[1].createdAt))
    const evidence = current ? (products.get(current.id) || []).filter(p => p.type === 'pull_request' && p.provider === 'github' && p.url === pr?.url) : []
    const shas = evidence.map(p => p.metadata?.delivery?.sha)
    const sha = shas.length && shas.every(s => exactSha(s) && s === shas[0]) ? shas[0] : undefined
    const passed = evidence.length > 0 && evidence.every(p => p.metadata?.delivery?.outcome === 'passed')
    const ordered = role === 'developer' || (!!previous && previous.status === 'done' && time(previous.createdAt) <= time(previous.completedAt) && time(previous.completedAt) < time(current?.createdAt))
    if (role === 'developer' && current) {
      const qa = candidate.children.filter(i => i.assigneeAgentId === ids['browser-qa'])
      rework = qa.some(q => q.status === 'done' && time(q.createdAt) <= time(q.completedAt) && time(q.completedAt) < time(current.createdAt) && issues.some(d => d.status === 'done' && time(d.createdAt) <= time(d.completedAt) && time(d.completedAt) < time(q.createdAt)) && !candidate.children.some(i => i.id !== q.id && (i.assigneeAgentId === ids.reviewer || i.assigneeAgentId === ids['browser-qa']) && (!Number.isFinite(time(i.createdAt)) || (time(i.createdAt) >= time(q.createdAt) && time(i.createdAt) <= time(current.createdAt))))) &&
        !candidate.children.some(i => (i.assigneeAgentId === ids.reviewer || i.assigneeAgentId === ids['browser-qa']) && (!Number.isFinite(time(i.createdAt)) || time(i.createdAt) === time(current.createdAt)))
    }
    let state: Gate['state'] = 'waiting'
    if (current) {
      state = 'unknown'
      if (!ambiguous) {
        if (!ordered || (sha && pr && sha !== pr.head)) state = 'invalidated'
        else if (current.status === 'in_progress') state = role === 'developer' && rework ? 'rework' : 'active'
        else if (current.status === 'todo') state = 'waiting'
        else if (current.status === 'done' && time(current.createdAt) <= time(current.completedAt) && sha && chain && (role === 'developer' || passed)) state = 'valid'
      }
    }
    gates.push({ role, state, ...(current ? { task: current.identifier } : {}), ...(sha ? { sha } : {}) })
    chain = chain && state === 'valid'
    previous = current
  }
  return { issue: candidate.parent.identifier, title: label(candidate.parent.title), status: candidate.parent.status, gates, ...(pr ? { pr } : {}), merge: pr?.state === 'merged' ? 'merged' : chain ? 'ready' : 'waiting', notice: !pr ? 'PR identity or current GitHub head unavailable' : gates.some(g => g.state === 'unknown') ? 'Structured gate evidence unavailable' : 'Human merge only' }
}
// Two-minute freshness window. Expired values are never served after a failed read.
export const GITHUB_TTL_MS = 120_000
export function createGithubReader(fetcher: typeof fetch, token?: string, now = Date.now) {
  type Identity = NonNullable<ReturnType<typeof prIdentity>>
  type Entry = { until: number; value?: PullRequest; pending?: Promise<PullRequest | undefined> }
  const cache = new Map<string, Entry>()
  let nextRequest = 0
  let failures = 0
  return async (identity: Identity): Promise<PullRequest | undefined> => {
    const key = `${identity.repository.toLowerCase()}/${identity.number}`
    const existing = cache.get(key)
    if (existing?.pending) {
      const value = await existing.pending
      return value ? { ...value, ...identity } : undefined
    }
    if (existing && now() < existing.until) return existing.value ? { ...existing.value, ...identity } : undefined
    if (now() < nextRequest) return undefined
    // At most 48 anonymous reads/hour across all PRs and browsers, leaving headroom.
    nextRequest = now() + (token ? 1000 : 75_000)
    if (cache.size >= 1000) {
      for (const [id, entry] of cache) if (!entry.pending && entry.until <= now()) cache.delete(id)
      if (cache.size >= 1000 && !existing) return undefined
    }
    const entry: Entry = { until: 0 }
    cache.set(key, entry)
    entry.pending = (async () => {
      try {
        const response = await fetcher(`https://api.github.com/repos/${identity.repository}/pulls/${identity.number}`, { method: 'GET', redirect: 'error', headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(1500) })
        const retry = response.headers.get('retry-after')
        const reset = response.headers.get('x-ratelimit-reset')
        const retryAt = retry ? (/^\d+$/.test(retry) ? now() + Number(retry) * 1000 : Date.parse(retry)) : 0
        const resetAt = response.headers.get('x-ratelimit-remaining') === '0' && reset ? Number(reset) * 1000 : 0
        // Server signals apply across identities; clamp to one hour, never spin/retry inline.
        const signalled = Math.max(Number.isFinite(retryAt) ? retryAt : 0, Number.isFinite(resetAt) ? resetAt : 0)
        nextRequest = Math.max(nextRequest, Math.min(now() + 3_600_000, signalled))
        if (!response.ok) throw new Error('Unavailable')
        const data = await response.json()
        if (data.number !== identity.number || typeof data.html_url !== 'string' || data.html_url.toLowerCase() !== identity.url.toLowerCase() || data.base?.repo?.full_name?.toLowerCase() !== identity.repository.toLowerCase() || !exactSha(data.head?.sha) || typeof data.head?.ref !== 'string' || typeof data.base?.ref !== 'string' || !['open','closed'].includes(data.state) || typeof data.merged !== 'boolean') throw new Error('Invalid PR')
        entry.value = { ...identity, head: data.head.sha, branch: label(data.head.ref), base: label(data.base.ref), state: data.merged ? 'merged' : data.state }
        entry.until = now() + GITHUB_TTL_MS
        failures = 0
        return entry.value
      } catch {
        failures = Math.min(failures + 1, 7)
        nextRequest = Math.max(nextRequest, now() + Math.min(300_000, 5000 * 2 ** (failures - 1)))
        // No stale green gates, including while rate limited or backing off.
        return undefined
      } finally { entry.pending = undefined }
    })()
    return entry.pending
  }
}

export async function loadDeliveries(input: unknown, ids: Record<RoleId,string>, read: (path: string) => Promise<unknown>, fetcher: typeof fetch, token?: string, github = createGithubReader(fetcher, token)): Promise<Delivery[]> {
  const selected = candidates(input, ids)
  const products = new Map<string, Product[]>()
  // Only direct members of selected deliveries are read. Bounded worker pool.
  const queue = [...new Set(selected.flatMap(c => [c.parent.id, ...c.children.map(i => i.id)]))]
  await Promise.all(Array.from({length: Math.min(4, queue.length)}, async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try { const data = await read(`/api/issues/${encodeURIComponent(id)}/work-products`); if (Array.isArray(data) && data.every(p => p && p.issueId === id)) products.set(id, data) } catch { /* unknown evidence */ }
    }
  }))
  return Promise.all(selected.map(async c => {
    let pr: PullRequest | undefined
    const members = [c.parent, ...c.children]
    const all = members.flatMap(i => products.get(i.id) || []).filter(p => p.type === 'pull_request')
    const refs = all.map(p => p.provider === 'github' ? prIdentity(p.url) : undefined)
    const identity = refs[0]
    if (members.every(i => products.has(i.id)) && identity && refs.every(r => r?.url === identity.url)) {
      pr = await github(identity)
    }
    return derive(c, ids, products, pr)
  }))
}
