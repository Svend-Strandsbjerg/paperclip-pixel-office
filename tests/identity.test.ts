import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapIdentities } from '../server/office-state.ts'
import { parseSnapshot } from '../src/provider.ts'
import { PALETTES, appearancePalette, normalizeAppearance, appearanceLabel } from '../src/identity.ts'
import { ROLES, demoSnapshot, mapVisualState } from '../src/state.ts'
import { avatarPath, portraitKey } from '../src/art.ts'
import { sceneCharacters } from '../src/scene.ts'

const ids = Object.fromEntries(ROLES.map(r => [r.id, r.id])) as Record<typeof ROLES[number]['id'], string>
const agents = ROLES.map((r, i) => ({ id: ids[r.id], name: `Colleague ${i}`, role: 'engineer', status: 'running',
  appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: Object.keys(PALETTES)[i] },
  avatarUrl: `/api/agent-avatars/cap-v1/${Object.keys(PALETTES)[i]}/rest.png?size=512&scale=1`,
  adapterConfig: { env: { secret: 'do-not-send' } },
}))

test('identity projection consumes authoritative appearance and excludes private configuration', () => {
  const identities = mapIdentities(agents, ids)
  const result = parseSnapshot({ mode: 'live', snapshot: demoSnapshot('working'), identities })
  assert.equal(result.identities!.developer!.name, 'Colleague 1')
  assert.equal(result.identities!.developer!.appearance!.paletteId, 'pink-lemonade')
  assert.doesNotMatch(JSON.stringify(result), /do-not-send|adapterConfig/)
  assert.deepEqual(mapIdentities([...agents].reverse(), ids), identities)
  assert.equal(Object.keys(mapIdentities(agents.slice(1), ids)).length, 3)
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

test('all palettes resolve native assets; identity survives reordered polls and state changes', () => {
  const identities = mapIdentities(agents, ids)
  const first = mapVisualState(demoSnapshot('idle'), identities)
  const second = mapVisualState(demoSnapshot('working'), mapIdentities([...agents].reverse(), ids))
  assert.deepEqual(first.map(a => a.identity), second.map(a => a.identity))
  assert.deepEqual(first.map(avatarPath), second.map(avatarPath))
  assert.equal(new Set(first.map(a => JSON.stringify(avatarPath(a)))).size, 4)
  assert.deepEqual(sceneCharacters(first, 0).map(c => [c.x, c.y]), sceneCharacters(second, 50).map(c => [c.x, c.y]))
  for (const paletteId of Object.keys(PALETTES) as (keyof typeof PALETTES)[]) {
    const sprite = avatarPath({ ...first[0], identity: { name: 'Test', role: 'ceo', appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId } } })
    assert.equal(sprite, `/api/office-avatar/cap-v1/${paletteId}.png`)
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

test('same appearance has identical native asset across roles and names; a poll changes it naturally', () => {
  const project = (paletteId: string) => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('working'),
    identities: mapIdentities(agents.map(a => ({ ...a, avatarUrl: undefined, appearance: { schemaVersion: 1, characterVersion: 'cap-v1', paletteId } })), ids) })
  const first = project('orchid-peach')
  const state = mapVisualState(first.snapshot, first.identities)
  assert.equal(new Set(state.map(avatarPath)).size, 1)
  assert.equal(new Set(state.map(portraitKey)).size, 1)
  const livePalettes = ['orchid-peach', 'tangerine-cobalt', 'solar-flare', 'violet-ember']
  const bodies = livePalettes.map(p => {
    const update = project(p)
    return avatarPath(mapVisualState(update.snapshot, update.identities)[0])
  })
  assert.equal(new Set(bodies.map(b => JSON.stringify(b))).size, 4)
  const next = project('tangerine-cobalt')
  const updated = mapVisualState(next.snapshot, next.identities)
  assert.notDeepEqual(avatarPath(state[0]), avatarPath(updated[0]))
  assert.notEqual(portraitKey(state[0]), portraitKey(updated[0]))
  assert.deepEqual(state.map(a => [a.col, a.row, a.desk]), updated.map(a => [a.col, a.row, a.desk]))
})

test('roster shares native canvas asset, updates identity and retries failures', async () => {
  const { paintPortrait, fallbackGhost } = await import('../src/art.ts')
  const state = mapVisualState(demoSnapshot('idle'), mapIdentities(agents, ids))
  const image = { dataset: {}, src: '', onerror: null } as unknown as HTMLImageElement
  paintPortrait(image, state[0])
  assert.equal(image.src, avatarPath(state[0]))
  paintPortrait(image, state[1])
  assert.equal(image.src, avatarPath(state[1]))
  ;(image.onerror as Function)()
  assert.equal(image.src, fallbackGhost)
  paintPortrait(image, state[1])
  assert.equal(image.src, fallbackGhost)
  image.dataset.retryAt = '1'
  paintPortrait(image, state[1])
  assert.equal(image.src, avatarPath(state[1]))
  paintPortrait(image, mapVisualState(demoSnapshot('idle'))[0])
  assert.equal(image.src, fallbackGhost)
})
