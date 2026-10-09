import { type VisualState } from './state'
import { createCharacter } from './vendor/pixel-agents/office/engine/characters'
import { CharacterState, Direction, TileType, TILE_SIZE } from './vendor/pixel-agents/office/types'
import type { FurnitureInstance, SpriteData } from './vendor/pixel-agents/office/types'
import { DESK_SQUARE_SPRITE, CHAIR_SPRITE, PC_SPRITE, PLANT_SPRITE, BOOKSHELF_SPRITE,
  COOLER_SPRITE, WHITEBOARD_SPRITE } from './vendor/pixel-agents/office/sprites/spriteData'

export const WIDTH = 384
export const HEIGHT = 272
export const tiles = Array.from({ length: HEIGHT / TILE_SIZE }, (_, row) =>
  Array.from({ length: WIDTH / TILE_SIZE }, (_, col) =>
    row < 2 || row === 16 || col === 0 || col === 23 ? TileType.WALL : TileType.FLOOR_1))

function item(sprite: SpriteData, x: number, y: number, zY = y + sprite.length): FurnitureInstance {
  return { sprite, x, y, zY }
}
export function sceneSize(state: VisualState) {
  return { width: WIDTH, height: Math.max(HEIGHT, ...state.map(a => a.row * TILE_SIZE + 80)) }
}
export function sceneFurniture(state: VisualState): FurnitureInstance[] { return [
  item(BOOKSHELF_SPRITE, 24, 24), item(BOOKSHELF_SPRITE, 328, 24),
  item(WHITEBOARD_SPRITE, 176, 15), item(COOLER_SPRITE, 344, 218),
  ...[[24, 77], [344, 77], [24, 219], [184, 230]].map(([x, y]) => item(PLANT_SPRITE, x, y)),
  ...state.flatMap(role => {
    const x = role.col * TILE_SIZE + 8
    const y = role.row * TILE_SIZE + 8
    return [item(CHAIR_SPRITE, x - 8, y - 12, y - 1),
      item(DESK_SQUARE_SPRITE, x - 16, y + 3), item(PC_SPRITE, x - 8, y + 5, y + 36)]
  }),
] }

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
