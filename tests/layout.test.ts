import { test } from 'node:test'
import assert from 'node:assert/strict'
import { officeLayout, workspacePad, activityAnchor, workstationLabel, deskBounds, type Rect } from '../src/layout'
import { rosterLayout, type RosterAgent } from '../src/state'
import { sharedDecorBounds, studioVariant } from '../src/environment'
import { deliveryPose } from '../src/handoff'
const agents = (n: number): RosterAgent[] => Array.from({ length: n }, (_, i) => ({ id: `id-${String(i).padStart(2, '0')}`, name: `Agent ${i}`, role: 'general', status: 'idle', activity: 'idle' }))
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
for (const n of [1, 4, 5, 6, 10, 12, 24, 40]) test(`${n} agents have deterministic, safe modules and activity anchors`, () => {
  const state = rosterLayout()(agents(n))
  assert.deepEqual(state, rosterLayout()(agents(n).reverse()))
  const layout = officeLayout(state)
  assert.equal(layout.modules.length, Math.ceil(n / 6))
  assert.equal(layout.height, Math.ceil(n / 6) * 448)
  assert.equal(layout.furniture.length, n)
  for (const seat of state) {
    const pad = workspacePad(seat)
    const floor = layout.modules.find(m => pad.y >= m.y && pad.y < m.y + m.height)!
    assert.ok(pad.x >= floor.x && pad.x + pad.width <= floor.x + floor.width)
    assert.ok(pad.y + pad.height <= floor.y + floor.height - 22)
  }
  const decoration = layout.modules.map(m => sharedDecorBounds(m.index))
  for (const m of layout.modules) {
    const b = sharedDecorBounds(m.index)
    assert.ok(b.x >= m.workspaceRight && b.x + b.width <= m.x + m.width)
    assert.ok(b.y >= m.y && b.y + b.height <= m.y + m.height)
  }
  // Includes 32px ghost artwork with hover/tilt and work props up to 34px above home.
  const envelopes = state.map(a => { const p = activityAnchor(a); return { x: p.x - 24, y: p.y - 34, width: 96, height: 54 } })
  envelopes.forEach((r, i) => {
    const module = layout.modules[Math.floor(i / 6)]
    assert.ok(r.x >= module.x && r.x + r.width <= module.workspaceRight)
    assert.ok(r.y >= module.y && r.y + r.height <= module.y + module.height)
    for (const furniture of [...layout.furniture, ...decoration]) assert.equal(overlaps(r, furniture), false)
    for (let j = 0; j < i; j++) assert.equal(overlaps(r, envelopes[j]), false)
    const anchor = activityAnchor(state[i]), name = workstationLabel(state[i])
    assert.equal(name.x, anchor.x)
    assert.equal(anchor.y - (deskBounds(state[i]).y + deskBounds(state[i]).height), 34)
    assert.ok(anchor.y < state[i].row * 16 + 52, 'home is closer than the previous anchor')
    // Labels retain CSS pixel dimensions as the scene scales on desktop/mobile.
    for (const scale of [1.15, 1.5, 2]) {
      const label = { x: name.x - 75 / scale, y: name.y, width: 150 / scale, height: 26 / scale }
      assert.ok(label.y - (anchor.y + 6) <= 16, 'label is immediately below its own ghost')
      for (const envelope of envelopes) assert.equal(overlaps(label, envelope), false)
      for (const furniture of layout.furniture) assert.equal(overlaps(label, furniture), false)
      for (const other of state) if (other !== state[i]) {
        const neighbour = activityAnchor(other)
        assert.ok(Math.hypot(name.x - anchor.x, name.y - anchor.y) < Math.hypot(name.x - neighbour.x, name.y - neighbour.y))
      }
    }
  })
  for (const source of state) for (const target of state) if (source !== target) {
    for (let t = 0; t <= 11; t += .1) {
      const p = deliveryPose(t, source, target)
      const body = { x: p.x - 16, y: p.y + 18, width: 32, height: 32 }
      for (const furniture of [...layout.furniture, ...decoration]) assert.equal(overlaps(body, furniture), false)
      for (const other of state) if (other !== source) {
        const anchor = activityAnchor(other)
        assert.equal(overlaps(body, { x: anchor.x - 16, y: anchor.y - 26, width: 32, height: 32 }), false)
      }
    }
  }
})
test('growth and transient partial polls preserve session seat assignments', () => {
  const allocate = rosterLayout()
  const first = allocate(agents(4))
  const grown = allocate([...agents(6)].reverse())
  for (const a of first) assert.deepEqual(grown.find(b => b.id === a.id), a)
  allocate(agents(6).slice(1))
  const reused = allocate([...agents(6).slice(1), { ...agents(1)[0], id: 'new' }])
  assert.equal(reused.find(a => a.id === 'new')?.desk, '07')
  const restored = allocate(agents(6))
  assert.deepEqual(restored, grown)
})

test('module artwork survives reload, reorder and expansion without cloned neighbors', () => {
  const variants = (n: number, reverse = false) => officeLayout(rosterLayout()(reverse ? agents(n).reverse() : agents(n))).modules.map(m => studioVariant(m.index))
  const first = variants(24)
  assert.deepEqual(first, variants(24, true))
  assert.deepEqual(first, variants(40).slice(0, first.length))
  assert.equal(new Set(first.map(v => JSON.stringify(v))).size, first.length)
  assert.equal(new Set(first.map(v => v.rug)).size, 4)
  assert.equal(new Set(first.map(v => v.plantSide)).size, 2)
  assert.equal(new Set(first.map(v => JSON.stringify(v.books))).size, 4)
})
