import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workItems } from '../src/work-items.ts'
import { ACTIVITY_PRESENTATION, workActivities } from '../src/work-activities.ts'

test('delivered item persists until actual work at the anchor, then becomes the returned result', () => {
  const items = workItems()
  items.place('dynamic-id', 'task-1', 0)
  assert.equal(items.sample('dynamic-id', false, true, 999)?.phase, 'waiting')
  assert.equal(items.sample('dynamic-id', true, false, 1000)?.phase, 'waiting')
  assert.equal(items.sample('dynamic-id', true, true, 1001)?.phase, 'processing')
  assert.equal(items.pickup('dynamic-id')?.taskId, 'task-1')
  assert.equal(items.sample('dynamic-id', false, true, 1002), undefined)
})
test('placement has a readable dwell, repeated deliveries stay bounded and roster cleanup removes props', () => {
  const items = workItems()
  for (let i = 0; i < 1000; i++) items.place('a', `task-${i}`, 0)
  assert.equal(items.sample('a', true, true, 0.5)?.phase, 'waiting')
  assert.equal(items.sample('a', true, true, 1)?.phase, 'processing')
  assert.equal(items.pickup('a')?.taskId, 'task-999')
  assert.equal(items.pickup('a'), undefined)
  items.place('removed', 'task', 0); items.sync(['a'])
  assert.equal(items.pickup('removed'), undefined)
})
test('temporary accessories and meaningful labels follow activity, never identity', () => {
  assert.equal(ACTIVITY_PRESENTATION.build.accessory, 'headset')
  assert.equal(ACTIVITY_PRESENTATION.write.accessory, 'headset')
  for (const profile of ['review', 'research', 'inspect'] as const) assert.equal(ACTIVITY_PRESENTATION[profile].accessory, 'glasses')
  assert.equal(new Set(Object.values(ACTIVITY_PRESENTATION).map(p => p.label)).size, 6)
  const activities = workActivities(), agent = Object.freeze({ id: 'future-id', activity: 'working' })
  activities.sync([agent]); const frame = activities.sample(agent.id, 1, true)!
  assert.ok(ACTIVITY_PRESENTATION[frame.profile].icon)
  activities.sync([{ ...agent, activity: 'idle' }]); assert.equal(activities.sample(agent.id, 1, true), undefined)
  assert.equal(agent.activity, 'working')
})
