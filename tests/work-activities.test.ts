import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACTIVITY_PROFILES, ACTIVITY_CYCLE_SECONDS, paintWorkActivity, selectActivity, workActivities } from '../src/work-activities.ts'

test('enter working, stable polling, completed cycle, exit and reentry', () => {
  const activities = workActivities()
  activities.sync([{ id: 'new-agent', activity: 'idle' }])
  assert.equal(activities.sample('new-agent', 1, false), undefined)
  activities.sync([{ id: 'new-agent', activity: 'working' }])
  const first = activities.sample('new-agent', 1, false)!
  for (let i = 0; i < 10; i++) {
    activities.sync([{ id: 'new-agent', activity: 'working' }])
    assert.equal(activities.sample('new-agent', 0.1, false)!.profile, first.profile)
  }
  const next = activities.sample('new-agent', ACTIVITY_CYCLE_SECONDS - 2 + 0.01, false)!
  assert.notEqual(next.profile, first.profile)
  assert.ok(next.opacity < 0.02)
  activities.sync([{ id: 'new-agent', activity: 'idle' }])
  assert.equal(activities.sample('new-agent', 1, false), undefined)
  activities.sync([{ id: 'new-agent', activity: 'working' }])
  assert.equal(activities.sample('new-agent', 1, false)!.profile, first.profile)
})

test('handoff pauses immediately, resumes with fade, and cannot revive idle/removed agents', () => {
  const activities = workActivities()
  activities.sync([{ id: 'courier', activity: 'working' }])
  const first = activities.sample('courier', 4, false)!
  assert.equal(activities.sample('courier', 50, false, true), undefined)
  const resumed = activities.sample('courier', 0.1, false)!
  assert.equal(resumed.profile, first.profile)
  assert.ok(resumed.progress < 0.25)
  assert.ok(resumed.opacity < 0.2)
  activities.sync([])
  assert.equal(activities.sample('courier', 1, false), undefined)
})

test('deterministic identity selection covers all profiles for a dynamic roster and each cycle', () => {
  const ids = Array.from({ length: 100 }, (_, i) => `future-agent-${i}`)
  const activities = workActivities()
  activities.sync(ids.map(id => ({ id, activity: 'working' })))
  assert.equal(new Set(ids.map(id => activities.sample(id, 1, false)!.profile)).size, 6)
  for (const id of ids) {
    assert.equal(activities.sample(id, 0, false)!.profile, selectActivity(id))
    assert.equal(new Set(Array.from({ length: 6 }, (_, epoch) => selectActivity(id, epoch))).size, 6)
  }
})

test('reduced motion freezes profile and graphics even across long periods and interruption', () => {
  const activities = workActivities()
  activities.sync([{ id: 'a', activity: 'working' }])
  const first = activities.sample('a', 1, true)
  assert.deepEqual(activities.sample('a', 900, true), first)
  assert.equal(activities.sample('a', 900, true, true), undefined)
  assert.deepEqual(activities.sample('a', 900, true), first)
})

function drawing(profile: typeof ACTIVITY_PROFILES[number], progress: number, x = 0, y = 0) {
  const rectangles: { coords: number[]; color: string }[] = []
  const ctx = { fillStyle: '', globalAlpha: 1, save() {}, restore() {},
    fillRect(...coords: number[]) { rectangles.push({ coords, color: this.fillStyle }) } }
  paintWorkActivity(ctx as unknown as CanvasRenderingContext2D, { x, y }, { profile, progress, opacity: 1 })
  return rectangles
}
for (const profile of ACTIVITY_PROFILES) test(`${profile} has distinct animated graphics that translate with any anchor`, () => {
  const first = drawing(profile, 0.2)
  assert.ok(first.length > 0)
  assert.notDeepEqual(first, drawing(profile, 0.8))
  assert.deepEqual(drawing(profile, 0.2, 150, 80), first.map(r => ({ ...r, coords: [r.coords[0] + 150, r.coords[1] + 80, ...r.coords.slice(2)] })))
  for (const r of first) assert.ok(r.coords.every(Number.isFinite))
})
test('all six visual profiles are distinguishable', () => {
  assert.equal(new Set(ACTIVITY_PROFILES.map(p => JSON.stringify(drawing(p, 0.65)))).size, 6)
})
