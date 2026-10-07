import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffQueue, MAX_WAIT_MS, SEEN_LIMIT, handoffTracker, handoffPose, HANDOFF_SECONDS, demoHandoff } from '../src/handoff'
import { mapTasks } from '../server/office-state'
import { parseSnapshot } from '../src/provider'
import { demoSnapshot } from '../src/state'
const ids = { orchestrator: 'a', developer: 'b', 'browser-qa': 'c', reviewer: 'd' }
const parent = { id: 'parent-private', title: 'Parent', assigneeAgentId: 'a' }
const child = { id: 'child-private', parentId: parent.id, assigneeAgentId: 'b', identifier: 'DEV-36', title: 'Implement handoff', updatedAt: '2026-10-07', secret: 'private' }
test('read-only issue mapping requires parent and Developer; exposes bounded visual text only', () => {
  assert.deepEqual(mapTasks([parent, child], ids), [{ taskId: 'DEV-36', title: 'Implement handoff' }])
  for (const change of [{ parentId: null }, { assigneeAgentId: 'c' }, { identifier: 'private-uuid' }]) assert.deepEqual(mapTasks([parent, { ...child, ...change }], ids), [])
  assert.equal(mapTasks([parent, { ...child, title: 'x'.repeat(200) }], ids)[0].title.length, 80)
  assert.throws(() => mapTasks({}, ids))
})
test('hydration, assignment, creation, updates, repeated polls, reload and recovery are deterministic', () => {
  const track = handoffTracker()
  const existing = { taskId: 'DEV-1', title: 'Historical' }
  const next = { taskId: 'DEV-2', title: 'New child' }
  assert.deepEqual(track([existing]), [])
  assert.deepEqual(track([existing, next]), [{ ...next, source: 'orchestrator', target: 'developer' }])
  assert.deepEqual(track([existing, { ...next, title: 'Edited title' }]), [])
  assert.deepEqual(track([existing]), [])
  assert.deepEqual(track([existing, next]), [])
  assert.deepEqual(handoffTracker()([existing, next]), [])
  assert.deepEqual(track(null), [])
  assert.deepEqual(track([existing, next, { taskId: 'DEV-3', title: 'Missed during outage' }]), [])
  const assignment = handoffTracker()
  assert.deepEqual(assignment(mapTasks([parent, { ...child, assigneeAgentId: null }], ids)), [])
  assert.equal(assignment(mapTasks([parent, child], ids))[0].taskId, 'DEV-36')
})
test('fixed aisle route starts at own seat, reaches Developer neighbor, pauses and returns exactly', () => {
  assert.deepEqual([handoffPose(0).x, handoffPose(0).y], [104, 104])
  assert.equal(handoffPose(2).phase, 'outbound')
  assert.deepEqual([handoffPose(4).x, handoffPose(4).y], [264, 104])
  assert.equal(handoffPose(6).phase, 'bubble')
  assert.equal(handoffPose(8).phase, 'returning')
  assert.deepEqual([handoffPose(HANDOFF_SECONDS).x, handoffPose(HANDOFF_SECONDS).y], [104, 104])
  assert.equal(demoHandoff.target, 'developer')
})
test('browser rejects unbounded or internal task identifiers', () => {
  for (const task of [{ taskId: 'internal-uuid', title: 'Title' }, { taskId: 'DEV-1', title: 'x'.repeat(81) }]) {
    assert.throws(() => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks: [task] }))
  }
})

test('bounded queue keeps the newest two waiting events and displays them sequentially', () => {
  const queue = handoffQueue()
  const event = (n: number) => ({ ...demoHandoff, taskId: `DEV-${n}` })
  queue.push(event(1), 0)
  assert.equal(queue.advance(0, false)?.event.taskId, 'DEV-1')
  for (let n = 2; n <= 1000; n++) queue.push(event(n), 0)
  assert.equal(queue.advance(11000, false)?.event.taskId, 'DEV-999')
  // The remaining waiting item is stale before the next slot opens.
  assert.equal(queue.advance(22000, false), undefined)
  queue.push(event(1001), 22001)
  assert.equal(queue.advance(22001, true)?.event.taskId, 'DEV-1001')
  assert.equal(queue.advance(25001, true), undefined)
})
test('stale frames and hidden-tab clearing never replay queued handoffs', () => {
  const queue = handoffQueue()
  queue.push(demoHandoff, 0)
  assert.equal(queue.advance(MAX_WAIT_MS, false), undefined)
  queue.push(demoHandoff, 13000)
  assert.ok(queue.advance(13000, false))
  queue.push(demoHandoff, 13001)
  assert.equal(queue.advance(60000, false), undefined)
  queue.push(demoHandoff, 60001)
  queue.clear()
  assert.equal(queue.advance(60002, false), undefined)
})
test('dedup memory saturates quietly without evicting and replaying historical IDs', () => {
  const track = handoffTracker()
  const tasks = Array.from({ length: SEEN_LIMIT }, (_, i) => ({ taskId: `DEV-${i}`, title: 'Task' }))
  assert.deepEqual(track(tasks), [])
  assert.deepEqual(track([]), [])
  assert.deepEqual(track([tasks[0]]), [])
  assert.deepEqual(track([{ taskId: 'DEV-10001', title: 'Beyond capacity' }]), [])
  track(null)
  assert.deepEqual(track([tasks[0]]), [])
  assert.deepEqual(track([{ taskId: 'DEV-10002', title: 'Still quiet' }]), [])
})
test('malformed unrelated issues do not suppress valid tasks; blank titles have a fallback', () => {
  assert.deepEqual(mapTasks([null, {}, { id: 'unrelated', title: null }, parent, child], ids), [{ taskId: 'DEV-36', title: child.title }])
  assert.deepEqual(mapTasks([parent, { ...child, title: null }], ids), [])
  assert.equal(mapTasks([parent, { ...child, title: '\x00\n\t' }], ids)[0].title, 'Untitled task')
})
