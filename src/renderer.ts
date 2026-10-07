import { handoffPose, HANDOFF_SECONDS, type Handoff } from './handoff'
import { CharacterState, Direction } from './vendor/pixel-agents/office/types'
import type { VisualState } from './state'
import { WIDTH, HEIGHT, tiles, furniture, sceneCharacters } from './scene'
import { renderTileGrid, renderScene } from './vendor/pixel-agents/office/engine/renderer'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
  let active: { event: Handoff; seconds: number } | undefined
  const pending: Handoff[] = []
  const bubble = document.createElement('div')
  bubble.className = 'task-bubble'
  bubble.setAttribute('role', 'status')
  bubble.hidden = true
  canvas.parentElement!.append(bubble)
  canvas.dataset.handoff = 'rest'
  function updateHandoff(dt: number) {
    if (!active && pending.length) {
      active = { event: pending.shift()!, seconds: 0 }
      bubble.textContent = `${active.event.taskId} — ${active.event.title}`
    }
    if (active) {
      active.seconds += dt
      if (active.seconds >= HANDOFF_SECONDS) active = undefined
    }
    const pose = active ? handoffPose(active.seconds) : undefined
    canvas.dataset.handoff = pose?.phase ?? 'rest'
    bubble.hidden = pose?.phase !== 'bubble'
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  canvas.width = WIDTH * 3
  canvas.height = HEIGHT * 3
  const stop = startGameLoop(canvas, {
    update: dt => { elapsed += dt; updateHandoff(dt) },
    render: ctx => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      renderTileGrid(ctx, tiles, 0, 0, 3)
      // Window light and two desk rugs, drawn below the reused depth-sorted scene.
      ctx.fillStyle = '#bad4cd'
      for (const x of [74, 252]) {
        ctx.fillRect(x * 3, 9 * 3, 48 * 3, 19 * 3)
        ctx.fillStyle = '#587777'
        ctx.fillRect((x + 23) * 3, 9 * 3, 2 * 3, 19 * 3)
        ctx.fillStyle = '#bad4cd'
      }
      ctx.fillStyle = '#72887f'
      for (const y of [76, 172]) ctx.fillRect(54 * 3, y * 3, 268 * 3, 65 * 3)
      const characters = sceneCharacters(state, elapsed, motion.matches)
      if (active) {
        const pose = handoffPose(active.seconds)
        const visitor = characters[0]
        visitor.x = pose.x; visitor.y = pose.y
        visitor.state = pose.phase === 'bubble' ? CharacterState.IDLE : CharacterState.WALK
        visitor.dir = pose.phase === 'bubble' ? Direction.RIGHT : pose.dx ? (pose.dx > 0 ? Direction.RIGHT : Direction.LEFT) : (pose.dy > 0 ? Direction.DOWN : Direction.UP)
        visitor.frame = motion.matches ? 1 : Math.floor(elapsed / 0.15) % 4
      }
      renderScene(ctx, furniture, characters, 0, 0, 3, null, null)
      for (const agent of state) {
        const x = (agent.col * 16 + 8) * 3
        const y = (agent.row * 16 + 8) * 3
        ctx.fillStyle = agent.activity === 'working' ? '#c7f38f' : '#d6dfda'
        // State light is visible even when motion is disabled.
        ctx.fillRect(x + 25, y + 43, 9, 6)
      }
    },
  })
  return { setState: (next: VisualState) => { state = next }, handoff: (event: Handoff) => { pending.push(event) }, destroy: () => { stop(); bubble.remove() } }
}
