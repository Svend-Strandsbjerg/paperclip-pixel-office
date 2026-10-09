import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionTracker, deliveryPose, type Completion } from '../src/handoff'
import { mapCompletions } from '../server/office-state'
import { parseSnapshot } from '../src/provider'
import { ROLES } from '../src/state'

test('Developer, Browser QA, Reviewer and future agents return only authoritative completed child work', () => {
  for (const id of ['developer', 'browser-qa', 'reviewer', 'future-agent']) {
    const roster = [{ id, name: id, role: id, status: 'idle', activity: 'idle' as const }]
    const parent = { id: 'parent', assigneeAgentId: 'orchestrator' }
    const child = { id: 'child', identifier: 'DEV-1', parentId: 'parent', assigneeAgentId: id, title: 'Done! (text is irrelevant)', status: 'in_progress' }
    const track = completionTracker()
    const map = (status: string) => mapCompletions([parent, { ...child, status }], 'orchestrator', roster)
    assert.deepEqual(track(map('in_progress')), [])
    assert.deepEqual(track(map('in_progress')), []) // idle roster is not completion
    assert.deepEqual(track(map('blocked')), [])
    assert.deepEqual(track(map('done')), [{ taskId: 'DEV-1', title: child.title, source: id, target: 'orchestrator', kind: 'result' }])
    assert.deepEqual(track(map('done')), [])
    assert.deepEqual(track(map('in_progress')), [])
    assert.deepEqual(track(map('done')), []) // no replay
    assert.deepEqual(mapCompletions([parent, { ...child, parentId: 'unrelated', status: 'done' }], 'orchestrator', roster), [])
    assert.deepEqual(mapCompletions([parent, { ...child, status: 'cancelled' }], 'orchestrator', roster), [])
  }
})

test('initial load, reconnect, missing issues, reassignment and edits never invent return events', () => {
  const task: Completion = { taskId: 'DEV-1', title: 'x', agentId: 'dev', status: 'open' }
  const track = completionTracker()
  assert.deepEqual(track([{ ...task, status: 'done' }]), [])
  track([task]); track(null)
  assert.deepEqual(track([{ ...task, status: 'done' }]), [])
  const fresh = completionTracker(); fresh([task]); fresh([])
  assert.deepEqual(fresh([{ ...task, status: 'done' }]), [])
  const reassigned = completionTracker(); reassigned([task])
  assert.deepEqual(reassigned([{ ...task, agentId: 'qa', status: 'done' }]), [])
  const parsed = parseSnapshot({ mode: 'live', snapshot: {}, completions: [task] })
  assert.deepEqual(parsed.completions, [task])
  for (const change of [{ status: 'idle' }, { taskId: 'uuid' }, { agentId: '' }, { title: 'x'.repeat(81) }]) assert.throws(() => parseSnapshot({ mode: 'live', snapshot: {}, completions: [{ ...task, ...change }] }))
})

test('outbound and generic return couriers carry paper to delivery, face travel, then return home empty', () => {
  for (const source of [...ROLES, { col: 6, row: 30 }]) {
    const target = source === ROLES[0] ? ROLES[1] : ROLES[0]
    const start = deliveryPose(0, source, target), delivered = deliveryPose(5, source, target), home = deliveryPose(11, source, target)
    assert.deepEqual([start.x, start.y], [source.col * 16 + 8, source.row * 16 + 8])
    assert.equal(start.carrying, true)
    assert.equal(delivered.phase, 'bubble'); assert.equal(delivered.carrying, true)
    assert.equal(delivered.dx, 0); assert.equal(delivered.dy, 0)
    assert.equal(home.carrying, false)
    assert.deepEqual([home.x, home.y], [start.x, start.y])
    for (const time of [1, 2, 3]) {
      const outbound = deliveryPose(time, source, target), back = deliveryPose(11 - time, source, target)
      assert.ok(Math.abs(outbound.x - back.x) < 0.001 && Math.abs(outbound.y - back.y) < 0.001)
      assert.equal(outbound.dx + back.dx, 0); assert.equal(outbound.dy + back.dy, 0)
    }
  }
})
