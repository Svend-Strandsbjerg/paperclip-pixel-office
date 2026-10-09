import { paintGhost, paintStudio } from './art'
import { handoffPose, handoffQueue, type Handoff } from './handoff'
import { CharacterState, Direction } from './vendor/pixel-agents/office/types'
import type { VisualState } from './state'
import { sceneSize, sceneFurniture, sceneCharacters } from './scene'
import { renderScene } from './vendor/pixel-agents/office/engine/renderer'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
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
    canvas.width = size.width * 3
    canvas.height = size.height * 3
    bubble.style.setProperty('--bubble-top', `${14 / size.height * 100}%`)
    bubble.style.setProperty('--qa-bubble-top', `${92 / size.height * 100}%`)
  }
  resize()
  const stop = startGameLoop(canvas, {
    update: dt => { elapsed += dt; updateHandoff() },
    render: ctx => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      paintStudio(ctx, state)
      const characters = sceneCharacters(state, elapsed, motion.matches)
      if (active && !motion.matches) {
        const pose = handoffPose(active.seconds, active.event.target)
        const visitor = characters[state.findIndex(a => (a.specialist ?? a.id) === 'orchestrator')]
        visitor.x = pose.x; visitor.y = pose.y
        visitor.state = pose.phase === 'bubble' ? CharacterState.IDLE : CharacterState.WALK
        visitor.dir = pose.phase === 'bubble' ? (active.event.target === 'browser-qa' ? Direction.LEFT : Direction.RIGHT) : pose.dx ? (pose.dx > 0 ? Direction.RIGHT : Direction.LEFT) : (pose.dy > 0 ? Direction.DOWN : Direction.UP)
        visitor.frame = Math.floor(elapsed / 0.15) % 4
      }
      renderScene(ctx, sceneFurniture(state), [], 0, 0, 3, null, null)
      for (const character of characters) {
        // Existing routes remain intact; the ghost hovers in front of its computer.
        paintGhost(ctx, state[character.id], character.x, character.y + 44)
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
  return { setState: (next: VisualState) => { state = next; resize(); if (active && !hasParticipants(active.event)) { queue.clear(); active = undefined; bubble.hidden = true } }, handoff: (event: Handoff) => { if (!document.hidden && hasParticipants(event)) queue.push(event, performance.now()) }, destroy: () => { stop(); document.removeEventListener('visibilitychange', onVisibility); bubble.remove() } }
}
