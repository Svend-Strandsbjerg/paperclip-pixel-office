import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ROLES, demoSnapshot, mapVisualState } from '../src/state'
import { sceneCharacters, WIDTH, HEIGHT } from '../src/scene'
import { getCharacterSprites } from '../src/vendor/pixel-agents/office/sprites/spriteData'
import { getCharacterSprite } from '../src/vendor/pixel-agents/office/engine/characters'

test('the exact four roles have unique permanent palettes and desks', () => {
  assert.deepEqual(ROLES.map(r => [r.name, r.palette, r.col, r.row, r.desk]), [
    ['Orchestrator', 0, 6, 6, '01'], ['Developer', 1, 19, 6, '02'],
    ['Browser QA', 2, 6, 14, '03'], ['Reviewer', 3, 19, 14, '04'],
  ])
  assert.equal(new Set(ROLES.map(r => `${r.col},${r.row}`)).size, 4)
  for (const role of ROLES) {
    assert.ok(role.col * 16 < WIDTH && role.row * 16 < HEIGHT)
  }
})

test('mapping recognizes working only and keeps absent, invalid and inherited values idle', () => {
  for (const input of [undefined, null, false, 'working', [], { developer: true }, { developer: { status: 'working' } }]) {
    assert.ok(mapVisualState(input).every(r => r.activity === 'idle'))
  }
  const inherited = Object.create({ developer: 'working' })
  assert.equal(mapVisualState(inherited)[1].activity, 'idle')
  const mapped = mapVisualState({ developer: 'working', reviewer: 'error', stranger: 'working' })
  assert.deepEqual(mapped.map(r => r.activity), ['idle', 'working', 'idle', 'idle'])
  assert.equal(mapped.length, 4)
})

test('external state cannot replace identity, placement or add a role', () => {
  const input = { developer: 'working', palette: 9, col: 30, name: 'intruder', extra: 'working' }
  const before = structuredClone(input)
  const state = mapVisualState(input)
  assert.deepEqual(input, before)
  assert.deepEqual(state.map(({ activity, ...identity }) => identity), ROLES)
  assert.ok(Object.isFrozen(state) && state.every(Object.isFrozen))
  assert.throws(() => { (ROLES[0] as { col: number }).col = 9 }, TypeError)
})

test('demo modes map through the same boundary and preserve exact identity', () => {
  for (const [mode, expected] of [['idle', 0], ['mixed', 2], ['working', 4]] as const) {
    const state = mapVisualState(demoSnapshot(mode))
    assert.equal(state.filter(r => r.activity === 'working').length, expected)
    assert.deepEqual(state.map(({ activity, ...identity }) => identity), ROLES)
  }
})

test('fresh scene creation and state changes never move or recolor a character', () => {
  const identity = (mode: 'idle' | 'working', elapsed: number) => sceneCharacters(mapVisualState(demoSnapshot(mode)), elapsed)
    .map(({ id, x, y, palette, seatId, dir }) => ({ id, x, y, palette, seatId, dir }))
  assert.deepEqual(identity('idle', 0), identity('working', 500))
  assert.deepEqual(identity('working', 0), identity('working', 0))
})

test('working uses changing upstream typing frames; idle and reduced motion are stable', () => {
  const sprite = (mode: 'idle' | 'working', elapsed: number, reduce = false) => {
    const ch = sceneCharacters(mapVisualState(demoSnapshot(mode)), elapsed, reduce)[0]
    return getCharacterSprite(ch, getCharacterSprites(ch.palette))
  }
  assert.notDeepEqual(sprite('working', 0), sprite('working', 0.31))
  assert.deepEqual(sprite('idle', 0), sprite('idle', 0.31))
  assert.deepEqual(sprite('working', 0, true), sprite('working', 0.31, true))
  assert.notDeepEqual(sprite('idle', 0), sprite('working', 0))
})
