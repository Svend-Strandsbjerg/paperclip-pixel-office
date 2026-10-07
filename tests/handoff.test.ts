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

test('QA requires a completed Developer sibling and an Orchestrator parent, never idle state', () => {
  const qa = { ...child, id: 'qa', identifier: 'DEV-65', assigneeAgentId: ids['browser-qa'], description: 'Exact SHA: `0123456789abcdef0123456789abcdef01234567`' }
  assert.deepEqual(mapTasks([parent, qa], ids), [])
  assert.equal(mapTasks([parent, child, qa], ids).length, 1)
  const tasks = mapTasks([parent, { ...child, status: 'done' }, qa], ids)
  assert.deepEqual(tasks[1], { taskId: 'DEV-65', title: child.title, target: 'browser-qa', sha: '0123456789abcdef0123456789abcdef01234567' })
  assert.equal(mapTasks([{ ...parent, assigneeAgentId: ids.reviewer }, { ...child, status: 'done' }, qa], ids).length, 0)
  assert.equal(mapTasks([parent, { ...child, status: 'done', parentId: 'other' }, qa], ids).length, 0)
  const track = handoffTracker()
  assert.deepEqual(track(tasks.slice(0, 1)), [])
  assert.deepEqual(track(tasks), [{ ...tasks[1], source: 'orchestrator' }])
  assert.deepEqual(track(tasks), [])
  assert.deepEqual(track(tasks.map(t => ({ ...t, title: 'Edited', sha: undefined }))), [])
  assert.equal(mapTasks([parent, { ...child, status: 'done' }, { ...qa, description: 'No exact target supplied' }], ids)[1].sha, undefined)
  assert.deepEqual(handoffTracker()(tasks), [])
  track(null)
  assert.deepEqual(track([...tasks, { ...tasks[1], taskId: 'DEV-66' }]), [])
})

test('SHA comes only from an unambiguous full labeled QA assignment value', async () => {
  const { qaSha } = await import('../server/office-state')
  const sha = '0123456789abcdef0123456789abcdef01234567'
  assert.equal(qaSha(`Exact SHA: ${sha}`), sha)
  assert.equal(qaSha(`- Required tested SHA: \`${sha}\``), sha)
  for (const value of [undefined, `Commit ${sha}`, 'Exact SHA: abc1234', `Exact SHA: ${sha}\nExact SHA: ${'a'.repeat(40)}`]) assert.equal(qaSha(value), undefined)
  for (const task of [{ target: 'unknown' }, { target: 'browser-qa', sha: 'abc1234' }, { target: 'developer', sha }]) {
    assert.throws(() => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks: [{ taskId: 'DEV-1', title: 'Test', ...task }] }))
  }
})

test('shared route and queue visit Developer then QA and return to the permanent desk', () => {
  assert.deepEqual([handoffPose(4, 'browser-qa').x, handoffPose(4, 'browser-qa').y], [120, 200])
  assert.deepEqual([handoffPose(HANDOFF_SECONDS, 'browser-qa').x, handoffPose(HANDOFF_SECONDS, 'browser-qa').y], [104, 104])
  const queue = handoffQueue()
  queue.push(demoHandoff, 0)
  queue.push({ ...demoHandoff, target: 'browser-qa' }, 1)
  assert.equal(queue.advance(1, false)?.event.target, 'developer')
  assert.equal(queue.advance(11001, false)?.event.target, 'browser-qa')
  assert.equal(queue.advance(22001, false), undefined)
})

test('Reviewer uses completed QA in the same Orchestrator flow and only its own exact SHA', () => {
  const qa = { ...child, id: 'qa', assigneeAgentId: ids['browser-qa'], status: 'done', description: `Exact SHA: ${'a'.repeat(40)}` }
  const review = { ...child, id: 'review', identifier: 'DEV-71', assigneeAgentId: ids.reviewer, description: `Exact PR head SHA: ${'b'.repeat(40)}` }
  const mapped = (items: unknown[]) => mapTasks(items, ids).filter(t => t.target === 'reviewer')
  assert.deepEqual(mapped([parent, qa, review]), [{ taskId: 'DEV-71', title: child.title, target: 'reviewer', sha: 'b'.repeat(40) }])
  for (const changed of [{ status: 'in_progress' }, { parentId: 'other' }, { assigneeAgentId: ids.developer }]) assert.deepEqual(mapped([parent, { ...qa, ...changed }, review]), [])
  assert.deepEqual(mapped([{ ...parent, assigneeAgentId: ids.developer }, qa, review]), [])
  assert.equal(mapped([parent, qa, { ...review, description: 'Review abc1234' }])[0].sha, undefined)
  assert.equal(mapped([parent, qa, { ...review, description: `Exact SHA: ${'a'.repeat(40)}\nExact SHA: ${'b'.repeat(40)}` }])[0].sha, undefined)
  assert.deepEqual(parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks: mapped([parent, qa, review]) }).tasks, mapped([parent, qa, review]))
})

test('Reviewer hydration, dedup, removal/reappearance, restart and outage recovery stay silent', () => {
  const track = handoffTracker()
  const old = { taskId: 'DEV-1', title: 'Historical review', target: 'reviewer' as const }
  const fresh = { ...old, taskId: 'DEV-2' }
  assert.deepEqual(track([old]), [])
  assert.deepEqual(track([old, fresh]), [{ ...fresh, source: 'orchestrator' }])
  assert.deepEqual(track([{ ...fresh, title: 'Edited' }]), [])
  assert.deepEqual(track([old, fresh]), [])
  assert.deepEqual(handoffTracker()([old, fresh]), [])
  track(null)
  const missed = { ...old, taskId: 'DEV-3' }
  assert.deepEqual(track([old, fresh, missed]), [])
  assert.deepEqual(track([old, fresh, missed]), [])
  assert.equal(track([old, fresh, missed, { ...old, taskId: 'DEV-4' }]).length, 1)
})

test('Reviewer shares the sequential queue and returns precisely to the Orchestrator desk', () => {
  assert.deepEqual([handoffPose(0, 'reviewer').x, handoffPose(0, 'reviewer').y], [104, 104])
  assert.deepEqual([handoffPose(4, 'reviewer').x, handoffPose(4, 'reviewer').y], [264, 200])
  assert.equal(handoffPose(6, 'reviewer').phase, 'bubble')
  assert.equal(handoffPose(8, 'reviewer').phase, 'returning')
  assert.deepEqual([handoffPose(HANDOFF_SECONDS, 'reviewer').x, handoffPose(HANDOFF_SECONDS, 'reviewer').y], [104, 104])
  const queue = handoffQueue()
  queue.push({ ...demoHandoff, target: 'browser-qa' }, 0)
  assert.equal(queue.advance(0, false)?.event.target, 'browser-qa')
  queue.push({ ...demoHandoff, target: 'reviewer' }, 1)
  assert.equal(queue.advance(11000, false)?.event.target, 'reviewer')
  assert.equal(queue.advance(22000, false), undefined)
})
