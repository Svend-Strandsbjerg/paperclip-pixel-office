import { paintPortrait, fallbackGhost } from './art'
import type { VisualState } from './state'
import { STAGES, exactSha, type Delivery } from './pipeline'
const states = ['waiting', 'active', 'valid', 'invalidated', 'rework', 'blocked', 'unknown']
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
export const gateLabels = { waiting: 'Pending', active: 'In progress', valid: '✓ Completed', invalidated: 'Evidence outdated', rework: 'Changes requested · in progress', blocked: 'Blocked', unknown: 'Evidence unavailable' }
export function currentStep(d: Delivery): number {
  if (d.merge === 'merged') return -1
  const active = d.gates.findIndex(g => ['active', 'rework', 'blocked'].includes(g.state))
  const pending = d.gates.findIndex(g => g.state !== 'valid')
  return active >= 0 ? active : pending >= 0 ? pending : d.gates.length
}
const rendered = new WeakMap<HTMLElement, string>()
export function renderPipeline(root: HTMLElement, deliveries: Delivery[] | null | undefined, agents: VisualState = []) {
  const payload = JSON.stringify([deliveries ?? null, agents.map(a => [a.id, a.name, a.specialist, a.identity])])
  if (rendered.get(root) === payload) return
  rendered.set(root, payload)
  root.replaceChildren()
  const add = (parent: HTMLElement, tag: string, text: string, cls = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = cls; parent.append(node); return node
  }
  add(root, 'h2', 'Delivery pipeline')
  if (!deliveries?.length) { add(root, 'p', deliveries ? 'No active delivery parents.' : 'Delivery state unavailable • waiting for a fresh snapshot'); return }
  add(root, 'p', `${deliveries.length} ${deliveries.length === 1 ? 'delivery' : 'deliveries'} · ${deliveries.filter(d => d.merge === 'ready').length} awaiting human action`, 'pipeline-summary')
  const agentFor = (role: string) => {
    const matches = agents.filter(a => (a.specialist ?? a.id) === role)
    return matches.length === 1 ? matches[0] : undefined
  }
  const nameFor = (role: string) => agentFor(role)?.identity?.name ?? agentFor(role)?.name ?? (role === 'orchestrator' ? 'Orchestrator' : names[role as keyof typeof names])
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
    const current = currentStep(d)
    add(card, 'p', `${d.gates.filter(g => g.state === 'valid').length}/${d.gates.length} agent steps complete · ${d.merge === 'merged' ? 'Merged' : current === d.gates.length ? 'Awaiting human merge' : gateLabels[d.gates[current].state]}`, 'pipeline-progress')
    const rail = add(card, 'ol', '', 'pipeline-rail')
    d.gates.forEach((g, index) => {
      const item = add(rail, 'li', '', `gate gate-${g.state}`)
      if (index === current) item.setAttribute('aria-current', 'step')
      add(item, 'small', `STEP ${index + 1}${index === current ? ' · CURRENT' : ''}`, 'step-number')
      const person = add(item, 'div', '', 'pipeline-person')
      const portrait = add(person, 'img', '', 'pipeline-avatar') as HTMLImageElement
      portrait.alt = ''
      const agent = agentFor(g.role)
      if (agent) paintPortrait(portrait, agent)
      else portrait.src = fallbackGhost
      const identity = add(person, 'div', '', 'pipeline-identity')
      add(identity, 'strong', nameFor(g.role))
      add(identity, 'small', names[g.role])
      add(item, 'span', gateLabels[g.state], 'gate-status')
      add(item, 'p', `${nameFor(index === 0 ? 'orchestrator' : d.gates[index - 1].role)} → ${nameFor(g.role)}`, 'pipeline-handoff')
      if (g.task) add(item, 'small', g.task)
      if (g.sha) { const sha = add(item, 'code', g.sha.slice(0, 8), 'delivery-sha'); sha.title = g.sha }
    })
    const human = add(rail, 'li', '', `gate gate-${d.merge}`)
    if (current === d.gates.length) human.setAttribute('aria-current', 'step')
    add(human, 'small', `STEP ${d.gates.length + 1}${current === d.gates.length ? ' · CURRENT' : ''}`, 'step-number')
    add(human, 'strong', 'Human merge')
    add(human, 'span', d.merge === 'ready' ? 'Ready for human merge' : d.merge === 'merged' ? '✓ Merged' : 'Pending', 'gate-status')
    add(human, 'p', `${nameFor(d.gates[d.gates.length - 1].role)} → Human`, 'pipeline-handoff')
    add(card, 'p', d.notice, 'delivery-meta')
  }
}
