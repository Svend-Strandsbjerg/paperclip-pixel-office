import { test } from 'node:test'
import assert from 'node:assert/strict'
import { facing, FRONT, ghostMotion, hoverProfile } from '../src/ghost-motion.ts'
import { deliveryPose, HANDOFF_SECONDS, WALK_SECONDS } from '../src/handoff.ts'
import { ROLES, rosterLayout } from '../src/state.ts'

test('identity timing is deterministic, varied and independent of roster order/activity', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `agent-${i}`)
  assert.deepEqual(ids.map(hoverProfile), ids.map(id => hoverProfile(id)))
  assert.equal(new Set(ids.map(id => hoverProfile(id).phase)).size, ids.length)
  const layout = rosterLayout()
  const roster = ids.map(id => ({ id, name: id, role: 'engineer', status: 'idle', activity: 'idle' as const }))
  const motion = ghostMotion()
  motion.sync(layout(roster).map(a => a.id))
  const before = ids.map(id => ({ ...motion.sample(id, 1, 0.016, false) }))
  motion.sync(layout(roster.reverse().map(a => ({ ...a, activity: 'working' }))).map(a => a.id))
  assert.deepEqual(ids.map(id => motion.sample(id, 1, 0.016, false)), before)
  assert.ok(before.every(p => p.lift !== 0 && Math.abs(p.lift) <= 1.8))
  motion.sync([...ids, 'new-agent'])
  assert.notEqual(motion.sample('new-agent', 1, 0.016, false).lift, 0)
  motion.sync(['new-agent'])
  assert.deepEqual(motion.sample(ids[0], 2, 0.016, false), FRONT)
})

test('hover is bounded, continuous across cycles and continues while facing settles', () => {
  const motion = ghostMotion(); motion.sync(['ghost'])
  const { period } = hoverProfile('ghost')
  const first = motion.sample('ghost', 0, 0, false).lift
  assert.ok(Math.abs(motion.sample('ghost', period, 0, false).lift - first) < 1e-12)
  let last = first
  for (let i = 1; i <= 1000; i++) {
    const lift = motion.sample('ghost', i / 60, 1 / 60, false).lift
    assert.ok(Math.abs(lift - last) < 0.06)
    last = lift
  }
  const turn = motion.sample('ghost', 17, 1, false, 1, 0).turn
  const settling = { ...motion.sample('ghost', 17.016, 0.016, false) }
  assert.ok(settling.turn > 0 && settling.turn < turn)
  const rest = motion.sample('ghost', 19, 2, false)
  assert.ok(Math.abs(rest.turn) < 0.0001)
  assert.notEqual(rest.lift, settling.lift)
})

test('left/right, vertical and diagonal orientation normalize travel without walking frames', () => {
  assert.deepEqual(facing(-5, 0), { turn: -1, pitch: 0 })
  assert.deepEqual(facing(5, 0), { turn: 1, pitch: 0 })
  assert.deepEqual(facing(0, -5), { turn: 0, pitch: -1 })
  assert.deepEqual(facing(0, 5), { turn: 0, pitch: 1 })
  assert.deepEqual(facing(0, 0), { turn: 0, pitch: 0 })
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pose = facing(dx, dy)
    assert.equal(Math.sign(pose.turn), dx); assert.equal(Math.sign(pose.pitch), dy)
    assert.ok(Math.abs(pose.turn) < 1 && Math.abs(pose.pitch) < 1)
  }
})

test('reduced motion immediately resets decoration and retains route positions', () => {
  const motion = ghostMotion(); motion.sync(['ghost'])
  motion.sample('ghost', 1, 1, false, 1, -1)
  assert.deepEqual(motion.sample('ghost', 2, 0.016, true, 1, -1), FRONT)
  for (const target of ROLES.slice(1)) {
    const start = deliveryPose(0, ROLES[0], target)
    const end = deliveryPose(HANDOFF_SECONDS, ROLES[0], target)
    assert.equal(start.x, end.x); assert.equal(start.y, end.y)
    const arrival = deliveryPose(WALK_SECONDS, ROLES[0], target)
    assert.equal(arrival.phase, 'bubble')
    const snapshot = { ...arrival }
    motion.sample('ghost', 3, 0.016, false, arrival.dx, arrival.dy)
    assert.deepEqual(arrival, snapshot)
  }
})
