import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapIdentities } from '../server/office-state.ts'
import { parseSnapshot } from '../src/provider.ts'
import { PALETTES, appearancePalette, normalizeAppearance, appearanceLabel } from '../src/identity.ts'
import { ROLES, demoSnapshot, mapVisualState } from '../src/state.ts'
import { agentSprites, portraitKey } from '../src/art.ts'
import { sceneCharacters } from '../src/scene.ts'

const ids = Object.fromEntries(ROLES.map(r => [r.id, `private-${r.id}`])) as Record<typeof ROLES[number]['id'], string>
const agents = ROLES.map((r, i) => ({ id: ids[r.id], name: `Colleague ${i}`, role: 'engineer', status: 'running',
  appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: Object.keys(PALETTES)[i] },
  avatarUrl: '/api/agent-avatars/cap-v1/bubblegum-sky/rest.png?size=512&scale=1',
  adapterConfig: { env: { secret: 'do-not-send' } },
}))

test('identity projection consumes authoritative appearance and excludes configuration, IDs and URLs', () => {
  const identities = mapIdentities(agents, ids)
  const result = parseSnapshot({ mode: 'live', snapshot: demoSnapshot('working'), identities })
  assert.equal(result.identities!.developer!.name, 'Colleague 1')
  assert.equal(result.identities!.developer!.appearance!.paletteId, 'pink-lemonade')
  assert.doesNotMatch(JSON.stringify(result), /private-|do-not-send|avatarUrl|adapterConfig/)
  assert.deepEqual(mapIdentities([...agents].reverse(), ids), identities)
  assert.throws(() => mapIdentities(agents.slice(1), ids))
  assert.throws(() => mapIdentities([...agents, agents[0]], ids))
})

test('missing, future and malformed appearance use explicit local fallback without hiding activity', () => {
  for (const appearance of [null, {}, { schemaVersion: 2, characterVersion: 'cap-v1', paletteId: 'bubblegum-sky' }, { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: '__proto__' }]) {
    assert.equal(appearancePalette(appearance), undefined)
    const identities = mapIdentities(agents.map(a => ({ ...a, appearance })), ids)
    assert.equal(identities.developer.appearance, undefined)
    assert.equal(mapVisualState(demoSnapshot('working'), identities)[1].activity, 'working')
  }
  const invalid = parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), identities: { ...mapIdentities(agents, ids), developer: { name: 'X', role: 'X', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: 'url(javascript:bad)' } } } })
  assert.equal(invalid.identities!.developer!.appearance, undefined)
})

test('all palettes render through the same animation path; identity survives reordered polls and state changes', () => {
  const identities = mapIdentities(agents, ids)
  const first = mapVisualState(demoSnapshot('idle'), identities)
  const second = mapVisualState(demoSnapshot('working'), mapIdentities([...agents].reverse(), ids))
  assert.deepEqual(first.map(a => a.identity), second.map(a => a.identity))
  assert.deepEqual(first.map(agentSprites), second.map(agentSprites))
  assert.equal(new Set(first.map(a => JSON.stringify(agentSprites(a)))).size, 4)
  assert.deepEqual(sceneCharacters(first, 0).map(c => [c.x, c.y]), sceneCharacters(second, 50).map(c => [c.x, c.y]))
  for (const paletteId of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
    const sprite = agentSprites({ ...first[0], identity: { name: 'Test', role: 'ceo', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId } } })
    assert.ok(JSON.stringify(sprite).includes(PALETTES[paletteId][0]))
  }
})


test('strict tuple validation fails closed and discloses local fallback', () => {
  const valid = { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: 'orchid-peach' }
  for (const invalid of [undefined, null, [], true, 1, 'cap-v1', {},
    { ...valid, schemaVersion: '1' }, { ...valid, characterVersion: 'cap-v2' },
    { ...valid, paletteId: 3 }, { ...valid, paletteId: 'unknown' },
    { ...valid, extra: 'secret' }, Object.create(valid)]) {
    assert.equal(normalizeAppearance(invalid), undefined)
    assert.match(appearanceLabel({ name: 'X', role: 'X', appearance: normalizeAppearance(invalid) }), /Local fallback/)
  }
  assert.deepEqual(normalizeAppearance(valid), valid)
  assert.match(appearanceLabel({ name: 'X', role: 'X', appearance: normalizeAppearance(valid) }), /Paperclip · orchid-peach/)
})

test('same appearance has identical whole character across roles and names; a poll changes it naturally', () => {
  const project = (paletteId: string) => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('working'),
    identities: mapIdentities(agents.map(a => ({ ...a, appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId } })), ids) })
  const first = project('orchid-peach')
  const state = mapVisualState(first.snapshot, first.identities)
  assert.equal(new Set(state.map(agentSprites)).size, 1)
  assert.equal(new Set(state.map(portraitKey)).size, 1)
  const livePalettes = ['orchid-peach', 'tangerine-cobalt', 'solar-flare', 'violet-ember']
  const bodies = livePalettes.map(p => {
    const update = project(p)
    return agentSprites(mapVisualState(update.snapshot, update.identities)[0])
  })
  assert.equal(new Set(bodies.map(b => JSON.stringify(b))).size, 4)
  const next = project('tangerine-cobalt')
  const updated = mapVisualState(next.snapshot, next.identities)
  assert.notDeepEqual(agentSprites(state[0]), agentSprites(updated[0]))
  assert.notEqual(portraitKey(state[0]), portraitKey(updated[0]))
  assert.deepEqual(state.map(a => [a.col, a.row, a.desk]), updated.map(a => [a.col, a.row, a.desk]))
})

test('roster paints the canvas character frame and reuses it until appearance changes', async () => {
  const { paintPortrait } = await import('../src/art.ts')
  const { getCachedSprite } = await import('../src/vendor/pixel-agents/office/sprites/spriteCache.ts')
  const { Direction } = await import('../src/vendor/pixel-agents/office/types.ts')
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const drawn: unknown[] = []
  let encodes = 0
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({
      imageSmoothingEnabled: false, fillStyle: '', fillRect() {}, clearRect() {},
      drawImage: (sprite: unknown) => drawn.push(sprite),
    }), toDataURL: () => `data:image/png;test,${++encodes}` }),
  } })
  try {
    const state = mapVisualState(demoSnapshot('idle'), mapIdentities(agents, ids))
    const image = { dataset: {}, src: '' } as unknown as HTMLImageElement
    paintPortrait(image, state[0])
    assert.equal(drawn[0], getCachedSprite(agentSprites(state[0]).walk[Direction.DOWN][1], 3))
    paintPortrait(image, { ...state[0], activity: 'working' })
    assert.equal(encodes, 1)
    paintPortrait(image, state[1])
    assert.equal(encodes, 2)
    assert.equal(drawn[1], getCachedSprite(agentSprites(state[1]).walk[Direction.DOWN][1], 3))
    assert.notEqual(drawn[0], drawn[1])
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})
