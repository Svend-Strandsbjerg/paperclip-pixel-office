import { MODULE_HEIGHT, type Rect } from './layout'

const palettes = [
  { rug: '#c4cabb', textile: '#77958b', accent: '#bb8062', wood: '#c9a47c' },
  { rug: '#d6c4b5', textile: '#a48172', accent: '#789399', wood: '#b9916d' },
  { rug: '#becdd0', textile: '#708c9c', accent: '#b59a60', wood: '#c5a27f' },
  { rug: '#d3ccb4', textile: '#9b9b78', accent: '#a87e75', wood: '#bda080' },
] as const

/** Module identity, never roster order, time or random state, controls the art. */
export function studioVariant(index: number) {
  return {
    ...palettes[index % palettes.length],
    roundedRug: index % 2 === 0,
    plantSide: index % 2 === 0 ? 590 : 464,
    leaf: index % 3,
    board: index % 3,
    books: Array.from({ length: 7 }, (_, book) => 7 + (index * 7 + book * 11) % 13),
    loungeShift: index % 2 === 0 ? 0 : 22,
  }
}

/** Conservative solid-decoration envelope. Floors, light and rugs are passable.
 * All tall shared furniture is clipped to this strip; desktop props stay on desks.
 * The circulation lane and local activity/hover spaces remain unchanged. */
export function sharedDecorBounds(index: number): Rect {
  return { x: 432, y: index * MODULE_HEIGHT + 48, width: 176, height: 360 }
}
