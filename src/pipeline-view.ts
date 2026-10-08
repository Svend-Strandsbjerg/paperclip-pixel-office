import { STAGES, exactSha, type Delivery } from './pipeline'
const states = ['waiting', 'active', 'valid', 'invalidated', 'rework', 'unknown']
/** Invalid additive data must not take down agent activity. Only projected fields survive. */
export function parseDeliveries(input: unknown): Delivery[] | null {
  if (!Array.isArray(input)) return null
  try {
    return input.map((d): Delivery => {
      const text = (v: unknown, max = 120): string => { if (typeof v !== 'string' || v.length > max) throw new Error(); return v }
      if (!d || !Array.isArray(d.gates) || d.gates.length !== 3 || !['waiting','ready','merged'].includes(d.merge)) throw new Error()
      const gates: Delivery['gates'] = d.gates.map((g: Delivery['gates'][number], i: number) => {
        if (!g || g.role !== STAGES[i] || !states.includes(g.state) || (g.sha !== undefined && !exactSha(g.sha))) throw new Error()
        return { role: g.role, state: g.state, ...(g.task ? { task: text(g.task,32) } : {}), ...(g.sha ? { sha: g.sha } : {}) }
      })
      let pr: Delivery['pr']
      if (d.pr) {
        const p = d.pr
        if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(p.repository) || !Number.isSafeInteger(p.number) || p.number < 1 || p.url !== `https://github.com/${p.repository}/pull/${p.number}` || !exactSha(p.head) || !['open','closed','merged'].includes(p.state)) throw new Error()
        pr = { repository: text(p.repository), number: p.number, url: p.url, head: p.head, branch: text(p.branch), base: text(p.base), state: p.state }
      }
      if (d.merge === 'ready' && (!pr || pr.state !== 'open' || gates.some(g => g.state !== 'valid' || g.sha !== pr.head))) throw new Error()
      return { issue: text(d.issue,32), title: text(d.title), status: text(d.status,32), notice: text(d.notice), gates, ...(pr ? {pr} : {}), merge: d.merge }
    })
  } catch { return null }
}
const names = { developer: 'Developer', 'browser-qa': 'Browser QA', reviewer: 'Reviewer' }
export function renderPipeline(root: HTMLElement, deliveries: Delivery[] | null | undefined) {
  root.replaceChildren()
  const add = (parent: HTMLElement, tag: string, text: string, cls = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = cls; parent.append(node); return node
  }
  add(root, 'h2', 'Delivery pipeline')
  if (!deliveries?.length) { add(root, 'p', deliveries ? 'No active delivery parents.' : 'Delivery state unavailable • waiting for a fresh snapshot'); return }
  for (const d of deliveries) {
    const card = add(root, 'article', '', 'delivery-card')
    add(card, 'h3', `${d.issue} · ${d.title}`)
    add(card, 'p', `Parent: ${d.status.replaceAll('_', ' ')}`, 'delivery-meta')
    if (d.pr) {
      const link = add(card, 'a', `${d.pr.repository} · PR #${d.pr.number}`) as HTMLAnchorElement
      link.href = d.pr.url; link.rel = 'noreferrer'; link.target = '_blank'
      add(card, 'p', `${d.pr.branch} → ${d.pr.base} · ${d.pr.state}`, 'delivery-meta')
      add(card, 'p', `HEAD ${d.pr.head}`, 'delivery-sha')
    }
    const rail = add(card, 'ol', '', 'pipeline-rail')
    for (const g of d.gates) {
      const item = add(rail, 'li', '', `gate gate-${g.state}`)
      add(item, 'strong', names[g.role]); add(item, 'span', g.state === 'valid' ? '✓ Valid' : g.state === 'rework' ? 'Rework active' : g.state)
      if (g.task) add(item, 'small', g.task)
      add(item, 'code', g.sha || 'SHA unavailable', 'delivery-sha')
    }
    const human = add(rail, 'li', '', `gate gate-${d.merge}`)
    add(human, 'strong', 'Human merge'); add(human, 'span', d.merge === 'ready' ? 'Ready for human merge' : d.merge)
    add(card, 'p', d.notice, 'delivery-meta')
  }
}
