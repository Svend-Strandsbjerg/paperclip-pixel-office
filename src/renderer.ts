import { paintGhost, paintStudio } from './art'
import { handoffPose, handoffQueue, type Handoff } from './handoff'
import { ghostMotion } from './ghost-motion'
import type { VisualState } from './state'
import { sceneSize, sceneFurniture } from './scene'
import { renderScene } from './vendor/pixel-agents/office/engine/renderer'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
  let frameDelta = 0
  const ghosts = ghostMotion()
  ghosts.sync(state.map(agent => agent.id))
  let furniture = sceneFurniture(state)
  let active: { event: Handoff; seconds: number } | undefined
  const hasParticipants = (event: Handoff) => [event.source, event.target].every(role => state.some(a => (a.specialist ?? a.id) === role))
  const queue = handoffQueue()
  const bubble = document.createElement('div')
  bubble.className = 'task-bubble'
  bubble.setAttribute('role', 'status')
  bubble.hidden = true
  canvas.parentElement!.append(bubble)
  canvas.dataset.handoff = 'rest'
  function updateHandoff() {
    if (document.hidden) queue.clear()
    const next = queue.advance(performance.now(), motion.matches)
    if (next && next.event !== active?.event) {
      bubble.textContent = (next.event.context === 'rework' || next.event.target !== 'developer') ? `${next.event.context === 'rework' ? 'Rework' : next.event.target === 'reviewer' ? 'Review' : 'QA'} ${next.event.taskId}${next.event.sha ? ` @ ${next.event.sha.slice(0, 7)}` : ''} — ${next.event.title}` : `${next.event.taskId} — ${next.event.title}`
      bubble.dataset.target = next.event.target
      canvas.dataset.target = next.event.target
    }
    if (next && !hasParticipants(next.event)) { queue.clear(); active = undefined; bubble.hidden = true; return }
    active = next
    const phase = active ? (motion.matches ? 'bubble' : handoffPose(active.seconds, active.event.target).phase) : 'rest'
    if (canvas.dataset.handoff !== phase) canvas.dataset.handoff = phase
    const hidden = phase !== 'bubble'
    if (bubble.hidden !== hidden) bubble.hidden = hidden
  }
  const onVisibility = () => { if (document.hidden) { queue.clear(); updateHandoff() } }
  document.addEventListener('visibilitychange', onVisibility)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  function resize() {
    const size = sceneSize(state)
    if (canvas.width !== size.width * 3) canvas.width = size.width * 3
    if (canvas.height !== size.height * 3) canvas.height = size.height * 3
    bubble.style.setProperty('--bubble-top', `${14 / size.height * 100}%`)
    bubble.style.setProperty('--qa-bubble-top', `${92 / size.height * 100}%`)
  }
  resize()
  const stop = startGameLoop(canvas, {
    update: dt => { frameDelta = dt; elapsed += dt; updateHandoff() },
    render: ctx => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      paintStudio(ctx, state)
      const travel = active && !motion.matches ? handoffPose(active.seconds, active.event.target) : undefined
      renderScene(ctx, furniture, [], 0, 0, 3, null, null)
      for (const agent of state) {
        const visitor = (agent.specialist ?? agent.id) === 'orchestrator' ? travel : undefined
        const moving = visitor && visitor.phase !== 'bubble'
        const pose = ghosts.sample(agent.id, elapsed, frameDelta, motion.matches, moving ? visitor.dx : 0, moving ? visitor.dy : 0)
        paintGhost(ctx, agent, visitor?.x ?? agent.col * 16 + 8, (visitor?.y ?? agent.row * 16 + 8) + 44, pose)
      }
      for (const agent of state) {
        const x = (agent.col * 16 + 8) * 3
        const y = (agent.row * 16 + 8) * 3
        ctx.fillStyle = agent.activity === 'working' ? '#c7f38f' : '#d6dfda'
        // State light is visible even when motion is disabled.
        ctx.fillRect(x + 25, y + 43, 9, 6)
      }
    },
  })
  return { setState: (next: VisualState) => { state = next; ghosts.sync(state.map(agent => agent.id)); furniture = sceneFurniture(state); resize(); if (active && !hasParticipants(active.event)) { queue.clear(); active = undefined; bubble.hidden = true } }, handoff: (event: Handoff) => { if (!document.hidden && hasParticipants(event)) queue.push(event, performance.now()) }, destroy: () => { stop(); document.removeEventListener('visibilitychange', onVisibility); bubble.remove() } }
}
