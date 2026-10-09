import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionTracker, deliveryPose, SEEN_LIMIT, type Completion } from '../src/handoff'
import { mapCompletions } from '../server/office-state'
import { parseSnapshot } from '../src/provider'
import { ROLES, mapVisualState, rosterLayout } from '../src/state'
import { sceneSize } from '../src/scene'
import { officeLayout } from '../src/layout'

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

test('delivery arrivals and both travel legs clear furniture for known pairs and expanded rows', () => {
  const state = [...mapVisualState({}), ...rosterLayout()(Array.from({ length: 12 }, (_, i) => ({ id: `future-${i}`, name: 'Future', role: 'agent', status: 'idle', activity: 'idle' as const })))]
  const furniture = officeLayout(state).furniture
  for (const source of state) for (const target of state) {
    if (source.id === target.id) continue
    const arrival = deliveryPose(4, source, target)
    assert.deepEqual([arrival.x, arrival.y], [target.col * 16 + 8 + (target.col < 12 ? 48 : -48), target.row * 16 + 8])
    for (let step = 0; step <= 1100; step++) {
      const pose = deliveryPose(step / 100, source, target)
      const x = pose.x, y = pose.y + 44
      assert.ok(x - 8 > 16 && x + 8 < 368 && y + 8 < sceneSize(state).height - 16)
      for (const f of furniture) assert.ok(x + 8 <= f.x || x - 8 >= f.x + f.width || y - 3 >= f.y + f.height || y + 3 <= f.y,
        `${source.id} -> ${target.id} at ${step / 100}: (${x}, ${y}) overlaps (${f.x}, ${f.y})`)
    }
  }
})

test('completion titles normalize whitespace, controls, blank fallback and length like assignments', () => {
  const parent = { id: 'parent', assigneeAgentId: 'orchestrator' }
  const roster = [{ id: 'dev', name: 'Dev', role: 'developer', status: 'idle', activity: 'idle' as const }]
  for (const [title, expected] of [['  A\t\n B  ', 'A B'], ['\x00\n\t\x7f  ', 'Untitled task'], [' x'.repeat(100), ('x '.repeat(100)).slice(0, 80)]]) {
    const mapped = mapCompletions([parent, { parentId: 'parent', identifier: 'DEV-1', assigneeAgentId: 'dev', status: 'done', title }], 'orchestrator', roster)
    assert.equal(mapped[0].title, expected)
    assert.deepEqual(parseSnapshot({ mode: 'live', snapshot: {}, completions: mapped }).completions, mapped)
  }
})

test('completion dedup saturates permanently and quietly without replay after reconnect', () => {
  const track = completionTracker()
  const tasks: Completion[] = Array.from({ length: SEEN_LIMIT }, (_, i) => ({ taskId: `DEV-${i}`, title: 'Done', agentId: 'dev', status: 'done' }))
  assert.deepEqual(track(tasks), [])
  const fresh: Completion = { ...tasks[0], taskId: 'DEV-10001', status: 'open' }
  track([fresh])
  assert.deepEqual(track([{ ...fresh, status: 'done' }]), [])
  track(null)
  track([{ ...fresh, taskId: 'DEV-10002' }, { ...tasks[0], status: 'open' }])
  assert.deepEqual(track([{ ...fresh, taskId: 'DEV-10002', status: 'done' }, tasks[0]]), [])
})
