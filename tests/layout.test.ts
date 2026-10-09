import { test } from 'node:test'
import assert from 'node:assert/strict'
import { officeLayout, activityAnchor, type Rect } from '../src/layout'
import { rosterLayout, type RosterAgent } from '../src/state'
import { deliveryPose } from '../src/handoff'
const agents = (n: number): RosterAgent[] => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(2, '0')}`, name: `Agent ${i}`, role: 'general', status: 'idle', activity: 'idle' }))
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
for (const n of [1, 4, 5, 6, 10, 12]) test(`${n} agents have deterministic, safe modules and activity anchors`, () => {
  const state = rosterLayout()(agents(n))
  assert.deepEqual(state, rosterLayout()(agents(n).reverse()))
  const layout = officeLayout(state)
  assert.equal(layout.modules.length, Math.ceil(n / 6))
  assert.equal(layout.height, Math.ceil(n / 6) * 448)
  const envelopes = state.map(a => { const p = activityAnchor(a); return { x: p.x - 24, y: p.y - 36, width: 96, height: 56 } })
  envelopes.forEach((r, i) => {
    const module = layout.modules[Math.floor(i / 6)]
    assert.ok(r.x >= module.x && r.x + r.width <= 432)
    assert.ok(r.y >= module.y && r.y + r.height <= module.y + module.height)
    for (const furniture of layout.furniture) assert.equal(overlaps(r, furniture), false)
    for (let j = 0; j < i; j++) assert.equal(overlaps(r, envelopes[j]), false)
    const label = { x: state[i].col * 16 + 8 - 75, y: state[i].row * 16 - 50, width: 150, height: 24 }
    for (const envelope of envelopes) assert.equal(overlaps(label, envelope), false)
  })
  for (const source of state) for (const target of state) if (source !== target) {
    for (let t = 0; t <= 11; t += .1) {
      const p = deliveryPose(t, source, target)
      const body = { x: p.x - 16, y: p.y + 18, width: 32, height: 32 }
      for (const furniture of layout.furniture) assert.equal(overlaps(body, furniture), false)
      for (const other of state) if (other !== source) {
        const anchor = activityAnchor(other)
        assert.equal(overlaps(body, { x: anchor.x - 16, y: anchor.y - 26, width: 32, height: 32 }), false)
      }
    }
  }
})
test('growth preserves occupants and removal makes predictable reusable capacity', () => {
  const allocate = rosterLayout()
  const first = allocate(agents(4))
  const grown = allocate([...agents(6)].reverse())
  for (const a of first) assert.deepEqual(grown.find(b => b.id === a.id), a)
  allocate(agents(6).slice(1))
  const reused = allocate([...agents(6).slice(1), { ...agents(1)[0], id: 'new' }])
  assert.equal(reused.find(a => a.id === 'new')?.desk, '01')
})
