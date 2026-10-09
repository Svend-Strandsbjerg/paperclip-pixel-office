import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handoffQueue, MAX_WAIT_MS, SEEN_LIMIT, handoffTracker, demoHandoff } from '../src/handoff'
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
  const mapped = (items: unknown[]) => mapTasks([...items, { ...child, status: 'done' }], ids).filter(t => t.target === 'reviewer')
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
  const queue = handoffQueue()
  queue.push({ ...demoHandoff, target: 'browser-qa' }, 0)
  assert.equal(queue.advance(0, false)?.event.target, 'browser-qa')
  queue.push({ ...demoHandoff, target: 'reviewer' }, 1)
  assert.equal(queue.advance(11000, false)?.event.target, 'reviewer')
  assert.equal(queue.advance(22000, false), undefined)
})

const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z`
const implementation = { ...child, status: 'done', createdAt: date(1), completedAt: date(2) }
const completedQa = { ...child, id: 'qa', identifier: 'DEV-37', assigneeAgentId: ids['browser-qa'], status: 'done', createdAt: date(3), completedAt: date(4), description: `Exact SHA: ${'a'.repeat(40)}` }
const fix = { ...child, id: 'fix', identifier: 'DEV-38', title: 'Address findings', createdAt: date(5), description: `Exact PR head SHA to test: ${'b'.repeat(40)}` }
const flow = [parent, implementation, completedQa]
const mappedFix = (items: unknown[]) => mapTasks(items, ids).find(t => t.taskId === fix.identifier)

test('rework requires the ordered complete sibling chain and only uses its own SHA', () => {
  assert.deepEqual(mappedFix([...flow, fix]), { taskId: 'DEV-38', title: 'Address findings', target: 'developer', context: 'rework', sha: 'b'.repeat(40) })
  assert.equal(mappedFix([...flow, { ...fix, description: undefined }])?.sha, undefined)
  assert.equal(mappedFix([...flow, { ...fix, descriptionTruncated: true }])?.sha, undefined)
  assert.equal(mapTasks([...flow, fix], ids)[0].context, undefined)
  for (const qaChange of [{ status: 'in_progress' }, { completedAt: null }, { completedAt: date(6) }, { parentId: 'other' }, { createdAt: date(1) }]) {
    assert.equal(mappedFix([parent, implementation, { ...completedQa, ...qaChange }, fix])?.context, undefined)
  }
  for (const change of [{ createdAt: undefined }, { createdAt: 'invalid' }, { createdAt: date(3) }]) {
    assert.equal(mappedFix([...flow, { ...fix, ...change }])?.context, undefined)
  }
  assert.equal(mappedFix([parent, completedQa, fix])?.context, undefined)
  assert.equal(mappedFix([parent, { ...implementation, status: 'in_progress' }, completedQa, fix])?.context, undefined)
  assert.equal(mappedFix([...flow, { ...completedQa, id: 'later-qa', createdAt: date(4), status: 'in_progress' }, fix])?.context, undefined)
  const reviewer = { ...child, id: 'review', assigneeAgentId: ids.reviewer, createdAt: date(4) }
  assert.equal(mappedFix([...flow, reviewer, fix])?.context, undefined)
  assert.equal(mappedFix([...flow, { ...reviewer, createdAt: undefined }, fix])?.context, undefined)
  assert.equal(mappedFix([...flow, { ...reviewer, parentId: 'other' }, fix])?.context, 'rework')
  assert.deepEqual(mapTasks([parent, completedQa, reviewer], ids), []) // full-chain Reviewer invariant
})

test('new assignments drive rework once across multiple cycles; status, text and recovery do not', () => {
  const track = handoffTracker()
  track(mapTasks([parent, implementation, { ...completedQa, status: 'in_progress' }], ids))
  assert.deepEqual(track(mapTasks(flow, ids)), []) // QA done alone is silent
  const tasks = mapTasks([...flow, fix], ids)
  assert.equal(track(tasks)[0].context, 'rework')
  assert.deepEqual(track(tasks), [])
  assert.deepEqual(track(mapTasks(flow, ids)), [])
  assert.deepEqual(track(tasks), [])
  assert.deepEqual(track(mapTasks([...flow, { ...fix, title: 'Edited', status: 'done' }], ids)), [])
  const secondQa = { ...completedQa, id: 'qa2', identifier: 'DEV-39', createdAt: date(7), completedAt: date(8) }
  const secondFix = { ...fix, id: 'fix2', identifier: 'DEV-40', createdAt: date(9) }
  const repeated = mapTasks([...flow, { ...fix, status: 'done', completedAt: date(6) }, secondQa, secondFix], ids)
  assert.deepEqual(track(repeated).map(t => [t.taskId, t.context]), [['DEV-39', undefined], ['DEV-40', 'rework']])
  assert.deepEqual(handoffTracker()(repeated), [])
  track(null)
  const missed = [...repeated, { ...tasks[2], taskId: 'DEV-41' }]
  assert.deepEqual(track(missed), [])
  assert.deepEqual(track(missed), [])
  // Adding structural evidence later cannot replay an already observed assignment.
  const baseline = handoffTracker()
  baseline(mapTasks([parent, implementation, fix], ids))
  assert.equal(baseline(tasks).some(t => t.taskId === fix.identifier), false)
})

test('explicit SHA labels fail closed including invalid competing labels', async () => {
  const { qaSha } = await import('../server/office-state')
  const sha = 'abcdef0123456789abcdef0123456789abcdef01'
  for (const label of ['Exact SHA', 'Exact SHA to test', 'Exact SHA to review', 'Required exact SHA', 'Required exact SHA to review', 'Exact PR head SHA', 'Exact PR head SHA to test', 'Exact PR head SHA to review']) {
    assert.equal(qaSha(`${label}: ${sha}`), sha)
    assert.equal(qaSha(`- ${label}: \`${sha}\``), sha)
    for (const invalid of ['abc1234', 'unknown', `${sha} or ${'a'.repeat(40)}`, `\`${sha}`]) {
      assert.equal(qaSha(`Exact SHA: ${sha}\n${label}: ${invalid}`), undefined)
    }
  }
  assert.equal(qaSha(`The Exact SHA: ${sha}`), undefined)
})

test('rework crosses the browser boundary and shares queue, route and reduced-motion duration', async () => {
  const { demoReworkHandoff, demoQaHandoff } = await import('../src/handoff')
  const tasks = mapTasks([...flow, fix], ids)
  assert.deepEqual(parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks }).tasks, tasks)
  for (const context of ['rejected', true]) {
    assert.throws(() => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks: [{ ...tasks[2], context }] }))
  }
  assert.throws(() => parseSnapshot({ mode: 'live', snapshot: demoSnapshot('idle'), tasks: [{ ...tasks[2], target: 'reviewer' }] }))
  const queue = handoffQueue()
  queue.push(demoQaHandoff, 0)
  assert.equal(queue.advance(0, false)?.event.target, 'browser-qa')
  queue.push(demoReworkHandoff, 1)
  assert.equal(queue.advance(11000, false)?.event.context, 'rework')
  assert.equal(queue.advance(22000, false), undefined)
  queue.push(demoReworkHandoff, 23000)
  assert.equal(queue.advance(23000, true)?.event.taskId, 'DEMO-4')
  assert.equal(queue.advance(26000, true), undefined)
})

test('assignment of a new post-QA child qualifies, without activity or comment parsing', () => {
  const track = handoffTracker()
  track(mapTasks([...flow, { ...fix, assigneeAgentId: null }], ids))
  const events = track(mapTasks([...flow, fix], ids))
  assert.equal(events.length, 1)
  assert.equal(events[0].context, 'rework')
  const statusOnly = handoffTracker()
  statusOnly(mapTasks([parent, implementation], ids))
  assert.deepEqual(statusOnly(mapTasks([parent, { ...implementation, comments: 'REQUEST CHANGES', runtimeStatus: 'idle' }], ids)), [])
  assert.deepEqual(mapTasks([...flow, { ...fix, title: 'x'.repeat(200) + '\n', description: 'Commit ' + 'a'.repeat(40) }], ids).at(-1), {
    taskId: fix.identifier, title: 'x'.repeat(80), target: 'developer', context: 'rework',
  })
})

test('numeric task ordering preserves creation sequence across identifier digit boundaries', () => {
  assert.deepEqual(mapTasks([parent, { ...child, identifier: 'DEV-100' }, { ...child, id: 'earlier', identifier: 'DEV-99' }], ids).map(t => t.taskId), ['DEV-99', 'DEV-100'])
})


test('truncated QA and Reviewer descriptions retain available exact SHA; rework omits it', () => {
  const review = { ...child, id: 'review', identifier: 'DEV-71', assigneeAgentId: ids.reviewer,
    description: `Required exact SHA to review: ${'c'.repeat(40)}`, descriptionTruncated: true }
  const tasks = mapTasks([...flow.filter(t => t.id !== completedQa.id),
    { ...completedQa, descriptionTruncated: true }, review], ids)
  assert.equal(tasks.find(t => t.taskId === completedQa.identifier)?.sha, 'a'.repeat(40))
  assert.equal(tasks.find(t => t.taskId === review.identifier)?.sha, 'c'.repeat(40))
  for (const task of [completedQa, review]) {
    const invalid = { ...task, descriptionTruncated: true,
      description: `Exact SHA: ${'a'.repeat(40)}\nRequired exact SHA to review: unknown` }
    assert.equal(mapTasks([...flow.filter(t => t.id !== task.id), invalid], ids)
      .find(t => t.taskId === task.identifier)?.sha, undefined)
  }
  assert.equal(mappedFix([...flow, { ...fix, descriptionTruncated: true }])?.sha, undefined)
  assert.equal(mappedFix([...flow, { ...fix, descriptionTruncated: false }])?.sha, 'b'.repeat(40))
})

test('unknown sibling QA ordering leaves an ordinary Developer assignment', () => {
  for (const createdAt of [undefined, null, 'invalid', '', 0, true, {}, []]) {
    const pending = { ...completedQa, id: 'pending', identifier: 'DEV-72', status: 'in_progress', createdAt }
    assert.deepEqual(mappedFix([...flow, pending, fix]), { taskId: fix.identifier, title: fix.title })
    assert.equal(mappedFix([...flow, { ...pending, parentId: 'other' }, fix])?.context, 'rework')
  }
  const pending = { ...completedQa, id: 'pending', identifier: 'DEV-72', status: 'in_progress' }
  assert.equal(mappedFix([...flow, { ...pending, createdAt: date(4) }, fix])?.context, undefined)
  assert.equal(mappedFix([...flow, { ...pending, createdAt: date(6) }, fix])?.context, 'rework')
})

for (const [ordering, createdAt, qualifies] of [
  ['equal to candidate QA', date(3), false],
  ['equal to Developer task', date(5), false],
  ['between candidate QA and Developer task', date(4), false],
  ['strictly before candidate QA', date(2), true],
  ['strictly after Developer task', date(6), true],
] as const) {
  test(`competing QA created ${ordering} ${qualifies ? 'permits' : 'blocks'} rework`, () => {
    for (const status of ['todo', 'in_progress', 'done', 'cancelled']) {
      // This sibling cannot itself qualify as a completed pre-assignment cycle.
      const competing = { ...completedQa, id: 'competing', identifier: 'DEV-72', createdAt, completedAt: date(6), status }
      const expected = qualifies
        ? { taskId: fix.identifier, title: fix.title, target: 'developer', context: 'rework', sha: 'b'.repeat(40) }
        : { taskId: fix.identifier, title: fix.title }
      assert.deepEqual(mappedFix([...flow, competing, fix]), expected)
      assert.deepEqual(mappedFix([fix, competing, ...flow.slice().reverse()]), expected)
    }
  })
}
