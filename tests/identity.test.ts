import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapIdentities } from '../server/office-state.ts'
import { parseSnapshot } from '../src/provider.ts'
import { PALETTES, appearancePalette } from '../src/identity.ts'
import { ROLES, demoSnapshot, mapVisualState } from '../src/state.ts'
import { agentSprites } from '../src/art.ts'
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
  assert.equal(result.identities!.developer!.paletteId, 'pink-lemonade')
  assert.doesNotMatch(JSON.stringify(result), /private-|do-not-send|avatarUrl|adapterConfig/)
  assert.deepEqual(mapIdentities([...agents].reverse(), ids), identities)
  assert.throws(() => mapIdentities(agents.slice(1), ids))
  assert.throws(() => mapIdentities([...agents, agents[0]], ids))
})

test('missing, future and malformed appearance use explicit local fallback without hiding activity', () => {
  for (const appearance of [null, {}, { schemaVersion: 2, characterVersion: 'cap-v1', paletteId: 'bubblegum-sky' }, { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: '__proto__' }]) {
    assert.equal(appearancePalette(appearance), undefined)
    const identities = mapIdentities(agents.map(a => ({ ...a, appearance })), ids)
    assert.equal(identities.developer.paletteId, undefined)
    assert.equal(mapVisualState(demoSnapshot('working'), identities)[1].activity, 'working')
  }
  assert.throws(() => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), identities: { ...mapIdentities(agents, ids), developer: { name: 'X', role: 'X', paletteId: 'url(javascript:bad)' } } }))
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
    const sprite = agentSprites({ ...first[0], identity: { name: 'Test', role: 'ceo', paletteId } })
    assert.ok(JSON.stringify(sprite).includes(PALETTES[paletteId][0]))
  }
})
