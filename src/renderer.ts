import type { VisualState } from './state'
import { WIDTH, HEIGHT, tiles, furniture, sceneCharacters } from './scene'
import { renderTileGrid, renderScene } from './vendor/pixel-agents/office/engine/renderer'
import { startGameLoop } from './vendor/pixel-agents/office/engine/gameLoop'

/** The renderer receives visual state only. It owns no provider, networking or commands. */
export function mountOffice(canvas: HTMLCanvasElement, initialState: VisualState) {
  let state = initialState
  let elapsed = 0
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  canvas.width = WIDTH * 3
  canvas.height = HEIGHT * 3
  const stop = startGameLoop(canvas, {
    update: dt => { elapsed += dt },
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
      renderScene(ctx, furniture, sceneCharacters(state, elapsed, motion.matches), 0, 0, 3, null, null)
      for (const agent of state) {
        const x = (agent.col * 16 + 8) * 3
        const y = (agent.row * 16 + 8) * 3
        ctx.fillStyle = agent.activity === 'working' ? '#c7f38f' : '#d6dfda'
        // State light is visible even when motion is disabled.
        ctx.fillRect(x + 25, y + 43, 9, 6)
      }
    },
  })
  return { setState: (next: VisualState) => { state = next }, destroy: stop }
}
