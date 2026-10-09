import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ambientMotion } from '../src/ambient'
import { mapVisualState, rosterLayout } from '../src/state'
import { sceneFurniture, sceneSize } from '../src/scene'

test('ambient paths are deterministic, staggered, bounded, and clear of solid furniture and walls', () => {
  const state = [...mapVisualState({}), ...rosterLayout()(Array.from({ length: 12 }, (_, i) => ({ id: `future-${i}`, name: 'Future', role: 'agent', status: 'idle', activity: 'idle' as const })))]
  const a = ambientMotion(), b = ambientMotion()
  a.sync(state); b.sync(state)
  const movingAt = new Set<string>()
  for (let time = 0; time < 100; time += 0.1) {
    const moving: string[] = []
    for (const agent of state) {
      const pose = a.sample(agent.id, time, 0.1, true, false, false)
      assert.deepEqual(pose, b.sample(agent.id, time, 0.1, true, false, false))
      assert.ok(Math.abs(pose.x) <= 8 && pose.y >= 0 && pose.y <= 8)
      if (pose.y > 1) moving.push(agent.id)
      // Ground footprint stays below furniture; ghost artwork floats above it.
      const x = agent.col * 16 + 8 + pose.x, y = agent.row * 16 + 52 + pose.y
      assert.ok(x - 8 > 16 && x + 8 < 368 && y + 8 < sceneSize(state).height - 16)
      for (const f of sceneFurniture(state)) assert.ok(x + 8 <= f.x || x - 8 >= f.x + f.sprite[0].length || y - 3 >= f.y + f.sprite.length || y + 3 <= f.y)
    }
    movingAt.add(moving.join(','))
  }
  assert.ok(movingAt.size > 12)
})

test('working settles at desk, handoffs settle wandering smoothly, reduced motion disables it', () => {
  const state = mapVisualState({})
  const motion = ambientMotion(); motion.sync(state)
  for (let t = 0; t < 100; t += 0.1) assert.equal(motion.sample('developer', t, 0.1, false, false, false).y, 0)
  let time = 0
  while (motion.sample('developer', time, 0.1, true, false, false).y < 2) time += 0.1
  const before = motion.sample('developer', time, 0, true, false, false)
  let previous = before
  for (let i = 0; i < 120; i++) {
    const next = motion.sample('developer', time + i / 60, 1 / 60, true, false, true)
    assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < 0.5)
    assert.ok(next.y <= previous.y)
    previous = next
  }
  assert.ok(previous.y < 0.01)
  assert.equal(motion.sample('developer', time, 0.1, true, true, false).y, 0)
  motion.sample('developer', time, 1, true, false, false)
  for (let i = 0; i < 100; i++) motion.sample('developer', time, 0.1, false, false, false)
  assert.ok(motion.sample('developer', time, 0.1, false, false, false).y < 0.001)
  motion.sync([])
  assert.equal(motion.sample('developer', time, 1, true, false, false).y, 0)
})
