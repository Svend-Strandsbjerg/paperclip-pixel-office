import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapRoster, readConfig } from '../server/office-state'
import { parseSnapshot } from '../src/provider'
import { ROLES, rosterLayout } from '../src/state'
import { sceneSize, sceneFurniture, sceneCharacters } from '../src/scene'
import { avatarPath, portraitKey } from '../src/art'
const ids = Object.fromEntries(ROLES.map(r => [r.id, `uuid-${r.id}`]))
const original = ROLES.map(r => ({ id: ids[r.id], name: r.name, role: 'general', status: 'idle' }))
const extra = (i: number) => ({ id: `extra-${String(i).padStart(3, '0')}`, name: `Colleague ${i}`, role: 'general', title: 'Research specialist', status: 'running' })
const project = (agents: unknown[]) => parseSnapshot({ mode: 'live', snapshot: {}, agents: mapRoster(agents, ids) }).agents!
const positions = (state: ReturnType<ReturnType<typeof rosterLayout>>) => Object.fromEntries(state.map(a => [a.id, [a.col, a.row, a.desk]]))

test('authoritative roster grows past four, reserves familiar specialist desks and ignores ordering', () => {
  const layout = rosterLayout()
  const first = layout(project(original))
  assert.deepEqual(first.map(a => [a.col, a.row]), ROLES.map(a => [a.col, a.row]))
  assert.deepEqual(first.map(a => a.id), ROLES.map(a => ids[a.id]))
  const five = layout(project([...original, extra(0)]))
  assert.equal(five.length, 5)
  assert.equal(five[4].identity?.role, 'Research specialist')
  const many = [...original, ...Array.from({ length: 36 }, (_, i) => extra(i))]
  const state = layout(project(many))
  assert.equal(state.length, 40)
  assert.deepEqual(positions(state), positions(layout(project([...many].reverse()))))
  assert.deepEqual(positions(state), positions(rosterLayout()(project([...many].reverse()))))
  assert.deepEqual(positions(first), Object.fromEntries(Object.entries(positions(state)).filter(([id]) => id.startsWith('uuid-'))))
  const size = sceneSize(state)
  assert.ok(size.height > sceneSize(first).height)
  assert.equal(size.width, 384)
  assert.equal(sceneFurniture(state).length - sceneFurniture(first).length, 36 * 3)
  for (const a of state) {
    assert.ok(a.row * 16 + 60 < size.height)
    for (const b of state) if (a.id !== b.id) assert.ok(Math.abs(a.col - b.col) * 16 >= 88 || Math.abs(a.row - b.row) * 16 >= 96)
  }
  assert.equal(sceneCharacters(state, 1, true).length, 40)
})

test('poll updates rename, avatar, activity, removal and return without moving remaining agents', () => {
  const layout = rosterLayout()
  const before = layout(project([...original, extra(0), extra(1)]))
  const appearance = { schemaVersion: 1, characterVersion: 'cap-v1', paletteId: 'orchid-peach' }
  const next = layout(project([...original.slice(1), { ...extra(0), name: 'Renamed', status: 'paused', appearance, avatarUrl: '/api/agent-avatars/cap-v1/orchid-peach/rest.png?size=512&scale=1' }]))
  assert.equal(next.length, 4)
  const agent = next.find(a => a.id === extra(0).id)!
  assert.equal(agent.name, 'Renamed')
  assert.equal(agent.activity, 'idle')
  assert.equal(agent.status, 'paused')
  assert.deepEqual(agent.identity?.appearance, appearance)
  assert.equal(avatarPath(agent), '/api/office-avatar/cap-v1/orchid-peach.png')
  const changed = layout(project([{ ...extra(0), appearance, avatarUrl: '/api/agent-avatars/cap-v1/solar-flare/rest.png?size=512&scale=1' }]))[0]
  assert.notEqual(avatarPath(agent), avatarPath(changed))
  assert.notEqual(portraitKey(agent), portraitKey(changed))
  for (const a of next) assert.deepEqual(positions(next)[a.id], positions(before)[a.id])
  assert.deepEqual(positions(layout(project([...original, extra(0), extra(1)]))), positions(before))
  assert.deepEqual(layout(project([])), [])
})

test('roster needs no specialist mapping; missing specialists do not manufacture agents', () => {
  assert.equal(readConfig({ PAPERCLIP_API_URL: 'http://example.test', PAPERCLIP_API_KEY: 'key', PAPERCLIP_COMPANY_ID: 'c' }).mode, 'live')
  assert.equal(mapRoster([extra(1)])[0].specialist, undefined)
  assert.deepEqual(mapRoster([], ids), [])
  assert.throws(() => mapRoster([extra(1), extra(1)], ids))
  assert.throws(() => project([{ ...extra(1), status: null }]))
  assert.equal(mapRoster([{ ...extra(1), avatarUrl: 'https://evil.test/avatar.png', secret: 'private' }])[0].avatarUrl, undefined)
})
