import { agentSprites, paintStudio } from './art'
import { handoffPose, handoffQueue, type Handoff } from './handoff'
import { CharacterState, Direction } from './vendor/pixel-agents/office/types'
import type { VisualState } from './state'
import { WIDTH, HEIGHT, furniture, sceneCharacters } from './scene'
import { renderScene } from './vendor/pixel-agents/office/engine/renderer'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
  let active: { event: Handoff; seconds: number } | undefined
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
      bubble.textContent = next.event.target !== 'developer' ? `${next.event.target === 'reviewer' ? 'Review' : 'QA'} ${next.event.taskId}${next.event.sha ? ` @ ${next.event.sha.slice(0, 7)}` : ''} — ${next.event.title}` : `${next.event.taskId} — ${next.event.title}`
      bubble.dataset.target = next.event.target
      canvas.dataset.target = next.event.target
    }
    active = next
    const phase = active ? (motion.matches ? 'bubble' : handoffPose(active.seconds, active.event.target).phase) : 'rest'
    if (canvas.dataset.handoff !== phase) canvas.dataset.handoff = phase
    const hidden = phase !== 'bubble'
    if (bubble.hidden !== hidden) bubble.hidden = hidden
  }
  const onVisibility = () => { if (document.hidden) { queue.clear(); updateHandoff() } }
  document.addEventListener('visibilitychange', onVisibility)
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  canvas.width = WIDTH * 3
  canvas.height = HEIGHT * 3
  const stop = startGameLoop(canvas, {
    update: dt => { elapsed += dt; updateHandoff() },
    render: ctx => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      paintStudio(ctx, state)
      const characters = sceneCharacters(state, elapsed, motion.matches)
      if (active && !motion.matches) {
        const pose = handoffPose(active.seconds, active.event.target)
        const visitor = characters[0]
        visitor.x = pose.x; visitor.y = pose.y
        visitor.state = pose.phase === 'bubble' ? CharacterState.IDLE : CharacterState.WALK
        visitor.dir = pose.phase === 'bubble' ? (active.event.target === 'browser-qa' ? Direction.LEFT : Direction.RIGHT) : pose.dx ? (pose.dx > 0 ? Direction.RIGHT : Direction.LEFT) : (pose.dy > 0 ? Direction.DOWN : Direction.UP)
        visitor.frame = Math.floor(elapsed / 0.15) % 4
      }
      renderScene(ctx, furniture, characters, 0, 0, 3, null, null, character => agentSprites(state[character.id]))
      for (const agent of state) {
        const x = (agent.col * 16 + 8) * 3
        const y = (agent.row * 16 + 8) * 3
        ctx.fillStyle = agent.activity === 'working' ? '#c7f38f' : '#d6dfda'
        // State light is visible even when motion is disabled.
        ctx.fillRect(x + 25, y + 43, 9, 6)
      }
    },
  })
  return { setState: (next: VisualState) => { state = next }, handoff: (event: Handoff) => { if (!document.hidden) queue.push(event, performance.now()) }, destroy: () => { stop(); document.removeEventListener('visibilitychange', onVisibility); bubble.remove() } }
}
