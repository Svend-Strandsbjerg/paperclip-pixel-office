import './style.css'
import { demoSnapshot, mapVisualState, ROLES, type DemoMode } from './state'
import { mountOffice } from './renderer'
import { WIDTH, HEIGHT } from './scene'
import license from '../third_party/pixel-agents-LICENSE.txt?raw'

const root = document.querySelector<HTMLDivElement>('#app')!
root.innerHTML = `
  <header class="topbar"><a class="brand" href="./"><span class="brand-icon" aria-hidden="true">▤</span> PAPERCLIP <span class="brand-divider">/</span> <span class="brand-sub">Pixel Office</span></a><span class="source"><i></i> LOCAL DEMO</span></header>
  <main>
    <section class="intro"><div><p class="eyebrow">A LITTLE SPACE FOR BIG IDEAS</p><h1>The office is open.</h1><p class="subtitle">Four familiar roles. One shared workspace.</p></div><div class="office-count"><strong>04</strong><span>PERMANENT DESKS</span></div></section>
    <div class="workspace">
      <section class="office-panel" aria-label="Pixel office">
        <div class="panel-heading"><span><i class="status-dot"></i> THE STUDIO</span><span>FLOOR 01</span></div>
        <div class="scene"><canvas aria-label="Pixel office with four characters at their permanent desks" role="img"></canvas><div class="labels"></div></div>
        <div class="scene-footer"><span><i class="legend-dot working"></i> Working <i class="legend-dot idle"></i> Idle</span><span>Same faces. Same places.</span></div>
      </section>
      <aside class="team-panel" aria-labelledby="team-title"><div class="team-heading"><p class="eyebrow">IN THE OFFICE</p><h2 id="team-title">The team <span>4</span></h2></div><ul class="roster"></ul><div class="demo-note"><span class="note-icon" aria-hidden="true">◇</span><div><strong>A window into the work</strong><p>This is a local demonstration. Paperclip stays in control; this office only visualizes activity.</p></div></div></aside>
    </div>
    <section class="demo-bar" aria-label="Demo controls"><div><span class="eyebrow">TRY A SCENE</span><p>See the office change pace.</p></div><div class="mode-buttons" role="group" aria-label="Demo activity"><button data-mode="mixed" aria-pressed="true">Mixed activity</button><button data-mode="working" aria-pressed="false">All working</button><button data-mode="idle" aria-pressed="false">All idle</button></div><p id="activity-summary" role="status" aria-live="polite"></p></section>
    <footer><span>PIXEL OFFICE <span class="footer-slash">/</span> FOUNDATION 01</span><details><summary>Credits &amp; license</summary><p>Rendering and code-defined sprites adapted from <a href="https://github.com/rolandal/pixel-agents-standalone">Pixel Agents Standalone</a>, based on <a href="https://github.com/pixel-agents-hq/pixel-agents">Pixel Agents</a>.</p><pre class="license"></pre></details></footer>
  </main>`
root.querySelector('.license')!.textContent = license
const labels = root.querySelector<HTMLDivElement>('.labels')!
const roster = root.querySelector<HTMLUListElement>('.roster')!
for (const role of ROLES) {
  const label = document.createElement('div')
  label.className = 'desk-label'
  label.dataset.role = role.id
  label.style.left = `${(role.col * 16 + 8) / WIDTH * 100}%`
  label.style.top = `${(role.row * 16 - 26) / HEIGHT * 100}%`
  label.innerHTML = `<strong>${role.name}</strong><span class="activity"></span>`
  labels.append(label)
  const card = document.createElement('li')
  card.dataset.role = role.id
  card.style.setProperty('--role-color', role.color)
  card.innerHTML = `<span class="avatar" aria-hidden="true">${role.desk}</span><div class="role-info"><h3>${role.name}</h3><p>Desk ${role.desk} <span>·</span> <span class="activity"></span></p></div><i class="presence" aria-hidden="true"></i>`
  roster.append(card)
}
const office = mountOffice(root.querySelector('canvas')!, mapVisualState(demoSnapshot('mixed')))
function showDemo(mode: DemoMode) {
  const state = mapVisualState(demoSnapshot(mode))
  office.setState(state)
  for (const agent of state) {
    root.querySelectorAll<HTMLElement>(`[data-role="${agent.id}"]`).forEach(element => {
      element.dataset.activity = agent.activity
      element.querySelector('.activity')!.textContent = agent.activity === 'working' ? 'Working' : 'Idle'
    })
  }
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
  })
  const working = state.filter(agent => agent.activity === 'working').length
  root.querySelector('#activity-summary')!.textContent = `${working} working · ${4 - working} idle`
}
root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
  button.addEventListener('click', () => showDemo(button.dataset.mode as DemoMode))
})
showDemo('mixed')
if (import.meta.hot) import.meta.hot.dispose(() => office.destroy())
