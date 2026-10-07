// Adapted from rolandal/pixel-agents-standalone; MIT. See THIRD_PARTY.md.
// Bounded extraction: solid tile fallback and depth-sorted scene, no editor/spawning.
import { TileType, TILE_SIZE, CharacterState } from '../types.js'
import type { TileType as TileTypeVal, FurnitureInstance, Character } from '../types.js'
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache.js'
import { getCharacterSprites, type CharacterSprites } from '../sprites/spriteData.js'
import { getCharacterSprite } from './characters.js'
import { CHARACTER_SITTING_OFFSET_PX, CHARACTER_Z_SORT_OFFSET, OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA, HOVERED_OUTLINE_ALPHA } from '../../constants.js'

export function renderTileGrid(ctx: CanvasRenderingContext2D, tileMap: TileTypeVal[][],
  offsetX: number, offsetY: number, zoom: number): void {
  const s = TILE_SIZE * zoom
  for (let r = 0; r < tileMap.length; r++) {
    for (let c = 0; c < tileMap[r].length; c++) {
      const tile = tileMap[r][c]
      if (tile === TileType.VOID) continue
      ctx.fillStyle = tile === TileType.WALL ? '#33494b' : (r + c) % 2 ? '#82958b' : '#879a90'
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
    }
  }
}

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
  officeSprites?: (character: Character) => CharacterSprites,
): void {
  const drawables: ZDrawable[] = []

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom)
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy)
      },
    })
  }

  // Characters
  for (const ch of characters) {
    const sprites = officeSprites?.(ch) ?? getCharacterSprites(ch.palette, ch.hueShift)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height)

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
      const outlineData = getOutlineSprite(spriteData)
      const outlineCached = getCachedSprite(outlineData, zoom)
      const olDrawX = drawX - zoom  // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom  // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save()
          c.globalAlpha = outlineAlpha
          c.drawImage(outlineCached, olDrawX, olDrawY)
          c.restore()
        },
      })
    }

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY)
      },
    })
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }
}
