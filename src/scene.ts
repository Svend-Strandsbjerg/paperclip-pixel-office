import { type VisualState } from './state'
import { createCharacter } from './vendor/pixel-agents/office/engine/characters'
import { CharacterState, Direction } from './vendor/pixel-agents/office/types'
export { MODULE_WIDTH as WIDTH, MODULE_HEIGHT as HEIGHT } from './layout'
import { officeLayout } from './layout'
export function sceneSize(state: VisualState) {
  const { width, height } = officeLayout(state)
  return { width, height }
}

/** Pure adapter into the reused renderer's character format. No random allocation. */
export function sceneCharacters(state: VisualState, elapsed: number, reducedMotion = false) {
  return state.map((agent, index) => {
    const character = createCharacter(index, agent.palette, agent.id, {
      uid: agent.id, seatCol: agent.col, seatRow: agent.row, facingDir: Direction.DOWN, assigned: true,
    })
    character.state = agent.activity === 'working' ? CharacterState.TYPE : CharacterState.IDLE
    character.isActive = agent.activity === 'working'
    character.frame = reducedMotion ? 0 : Math.floor(elapsed / 0.3) % 2
    return character
  })
}
