import { renderPipeline } from './pipeline-view'
import { paintPortrait, agentAccent } from './art'
import { appearanceLabel, type Identity } from './identity'
import type { RoleId, RosterAgent } from './state'
import { demoHandoff, demoQaHandoff, demoReviewerHandoff, demoReworkHandoff } from './handoff'
import './style.css'
import { pollOffice } from './provider'
import { demoSnapshot, mapVisualState, rosterLayout, type DemoMode } from './state'
import { mountOffice } from './renderer'
import { sceneSize } from './scene'
import license from '../third_party/pixel-agents-LICENSE.txt?raw'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <header class="topbar"><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">▤</span> PAPERCLIP <span class="brand-divider">/</span> <span class="brand-sub">Pixel Office</span></a><span class="source"><i></i> CONNECTING</span></header>
  <main>
    <section class="intro"><div><p class="eyebrow">A LITTLE SPACE FOR BIG IDEAS</p><h1>The office is open.</h1><p class="subtitle">One team. A growing shared workspace.</p></div><div class="office-count"><strong>0</strong><span>AGENT DESKS</span></div></section>
    <div class="workspace">
      <section class="office-panel" aria-label="Pixel office">
        <div class="panel-heading"><span><i class="status-dot"></i> THE STUDIO</span><span>FLOOR 01</span></div>
        <div class="scene"><canvas aria-label="Pixel office waiting for the team" role="img"></canvas><div class="labels"></div></div>
        <div class="scene-footer"><span><i class="legend-dot working"></i> Working <i class="legend-dot idle"></i> Idle</span><span>Same faces. Same places.</span></div>
      </section>
      <aside class="team-panel" aria-labelledby="team-title"><div class="team-heading"><p class="eyebrow">IN THE OFFICE</p><h2 id="team-title">The team <span>0</span></h2></div><ul class="roster"></ul><div class="demo-note"><span class="note-icon" aria-hidden="true">◇</span><div><strong>A window into the work</strong><p>Connecting to office state. Paperclip stays in control; this office only visualizes activity.</p></div></div></aside>
    </div>
    <section class="pipeline-panel" aria-label="Delivery pipeline overview"></section>
    <section class="demo-bar" aria-label="Demo controls"><div><span class="eyebrow">TRY A SCENE</span><p>See the office change pace.</p></div><div class="mode-buttons" role="group" aria-label="Demo activity"><button data-mode="mixed" aria-pressed="true">Mixed activity</button><button data-mode="working" aria-pressed="false">All working</button><button data-mode="idle" aria-pressed="false">All idle</button><button class="demo-handoff">Demo handoff</button><button class="demo-qa-handoff">Demo QA handoff</button><button class="demo-reviewer-handoff">Demo Reviewer handoff</button><button class="demo-rework-handoff">Demo Rework handoff</button></div><p id="activity-summary" role="status" aria-live="polite"></p></section>
    <footer><span>PIXEL OFFICE <span class="footer-slash">/</span> FOUNDATION 01</span><details><summary>Credits &amp; license</summary><p>Rendering and code-defined sprites adapted from <a href="https://github.com/rolandal/pixel-agents-standalone">Pixel Agents Standalone</a>, based on <a href="https://github.com/pixel-agents-hq/pixel-agents">Pixel Agents</a>.</p><pre class="license"></pre></details></footer>
  </main>`
root.querySelector('.license')!.textContent = license
const labels = root.querySelector<HTMLDivElement>('.labels')!
const roster = root.querySelector<HTMLUListElement>('.roster')!
const office = mountOffice(root.querySelector('.scene canvas')!, [])
const layout = rosterLayout()
let identities: Partial<Record<RoleId, Identity>> | undefined
const cards = new Map<string, { card: HTMLLIElement; label: HTMLDivElement }>()
function showSnapshot(snapshot: unknown, agents?: RosterAgent[]) {
  const state = agents ? layout(agents) : mapVisualState(snapshot, identities)
  office.setState(state)
  const { width, height } = sceneSize(state)
  const present = new Set(state.map(a => a.id))
  for (const [id, elements] of cards) {
    if (!present.has(id)) { elements.card.remove(); elements.label.remove(); cards.delete(id) }
  }
  for (const agent of state) {
    let elements = cards.get(agent.id)
    if (!elements) {
      const label = document.createElement('div')
      label.className = 'desk-label'
      label.innerHTML = '<strong></strong><span class="activity"></span>'
      const card = document.createElement('li')
      card.innerHTML = '<span class="avatar" aria-hidden="true"><img class="portrait" alt="" /></span><div class="role-info"><h3></h3><p class="identity-name"></p><p class="appearance-label"></p><p class="desk-number"></p><p class="activity"></p></div><i class="presence" aria-hidden="true"></i>'
      elements = { card, label }
      cards.set(agent.id, elements)
    }
    const { card, label } = elements
    roster.append(card); labels.append(label)
    label.style.left = `${(agent.col * 16 + 8) / width * 100}%`
    label.style.top = `${(agent.row * 16 - 26) / height * 100}%`
    const name = agent.identity?.name ?? agent.name
    label.querySelector('strong')!.textContent = name
    label.title = name
    card.querySelector('h3')!.textContent = name
    card.querySelector('.identity-name')!.textContent = agent.identity?.role ?? agent.name
    card.querySelector('.desk-number')!.textContent = `Desk ${agent.desk}`
    card.title = appearanceLabel(agent.identity)
    card.querySelector('.appearance-label')!.textContent = isDemo ? 'Local demo appearance' : card.title
    paintPortrait(card.querySelector<HTMLImageElement>('.portrait')!, agent)
    for (const element of [card, label]) {
      element.dataset.role = agent.specialist ?? agent.id
      element.dataset.agentId = agent.id
      element.style.setProperty('--role-color', agentAccent(agent))
      element.dataset.activity = agent.activity
      element.querySelector('.activity')!.textContent = agent.activity === 'working' ? 'Working' : agent.status ?? 'Idle'
    }
  }
  const working = state.filter(agent => agent.activity === 'working').length
  root.querySelector('#activity-summary')!.textContent = `${working} working · ${state.length - working} idle`
  root.querySelector('.office-count strong')!.textContent = String(state.length).padStart(2, '0')
  root.querySelector('#team-title span')!.textContent = String(state.length)
  root.querySelector('canvas')!.setAttribute('aria-label', `Pixel office with ${state.length} agents at their desks`)
}
let isDemo = false
function showDemo(mode: DemoMode) {
  if (!isDemo) return
  showSnapshot(demoSnapshot(mode))
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  })
}
root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
  button.addEventListener('click', () => showDemo(button.dataset.mode as DemoMode))
})
root.querySelector('.demo-handoff')!.addEventListener('click', () => { if (isDemo) office.handoff(demoHandoff) })
root.querySelector('.demo-qa-handoff')!.addEventListener('click', () => { if (isDemo) office.handoff(demoQaHandoff) })
root.querySelector('.demo-reviewer-handoff')!.addEventListener('click', () => { if (isDemo) office.handoff(demoReviewerHandoff) })
root.querySelector('.demo-rework-handoff')!.addEventListener('click', () => { if (isDemo) office.handoff(demoReworkHandoff) })
const controls = root.querySelector<HTMLElement>('.mode-buttons')!
controls.hidden = true
root.querySelector('.demo-bar .eyebrow')!.textContent = 'OFFICE ACTIVITY'
root.querySelector('.demo-bar p')!.textContent = 'Waiting for state.'
showSnapshot({}, [])
root.querySelector('#activity-summary')!.textContent = 'Activity unavailable'
const pipeline = root.querySelector<HTMLElement>('.pipeline-panel')!
renderPipeline(pipeline, null)
let hasState = false
const stopPolling = pollOffice(data => {
  renderPipeline(pipeline, data.deliveries)
  hasState = true
  isDemo = data.mode === 'demo'
  controls.hidden = !isDemo
  root.querySelector('.source')!.textContent = isDemo ? 'LOCAL DEMO' : 'LIVE · CONNECTED'
  root.querySelector('.demo-note p')!.textContent = isDemo ? 'Deterministic local demonstration. No live activity is shown.' : 'Read-only Paperclip activity. Updates automatically.'
  root.querySelector('.demo-bar p')!.textContent = isDemo ? 'See the office change pace.' : 'Live agent activity'
  identities = data.identities
  showSnapshot(data.snapshot, data.agents)
}, () => {
  renderPipeline(pipeline, null)
  root.querySelector('.source')!.textContent = 'DISCONNECTED'
  root.querySelector('.demo-note p')!.textContent = hasState ? 'Connection lost. Showing the last received activity and appearance.' : 'Office state unavailable. No live activity has been received.'
}, event => office.handoff(event))
if (import.meta.hot) import.meta.hot.dispose(() => { stopPolling(); office.destroy() })
