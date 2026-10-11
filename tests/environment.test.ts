import { test } from 'node:test'
import assert from 'node:assert/strict'
import { paintStudio } from '../src/art'
import { rosterLayout } from '../src/state'

// Record actual canvas commands as well as the variant data: the cached drawing
// must use its variation and remain reproducible without browser/random state.
function drawing(count: number) {
  const commands: unknown[][] = []
  const gradient = { addColorStop: (...args: unknown[]) => commands.push(['stop', ...args]) }
  const ctx = new Proxy({}, {
    get: (_, key) => (...args: unknown[]) => {
      commands.push([key, ...args])
      return key === 'createLinearGradient' ? gradient : undefined
    },
    set: (_, key, value) => { commands.push([key, value === gradient ? 'daylight' : value]); return true },
  }) as CanvasRenderingContext2D
  const agents = rosterLayout()(Array.from({ length: count }, (_, i) => ({ id: `agent-${i}`, name: 'Colleague', role: 'general', status: 'idle', activity: 'idle' as const })))
  paintStudio(ctx, agents)
  return commands
}

test('environment drawing is deterministic, lightweight and never samples random state', t => {
  t.mock.method(Math, 'random', () => { throw new Error('Rendering must be deterministic') })
  for (const count of [1, 4, 12, 40]) {
    const commands = drawing(count)
    assert.deepEqual(commands, drawing(count))
    assert.ok(commands.length < Math.ceil(count / 6) * 1800 + count * 120)
    assert.equal(commands.filter(c => c[0] === 'clip').length, Math.ceil(count / 6))
    assert.equal(commands.filter(c => c[0] === 'createLinearGradient').length, Math.ceil(count / 6))
    assert.equal(commands.filter(c => c[0] === 'save').length, commands.filter(c => c[0] === 'restore').length)
    assert.equal(commands.some(c => c[0] === 'filter' || c[0] === 'shadowBlur'), false)
  }
})

test('multiple studios actually paint distinct textiles, wood and shelf contents', () => {
  const single = drawing(6), multiple = drawing(12)
  assert.equal(single.some(c => c[0] === 'fillStyle' && c[1] === '#a48172'), false)
  assert.ok(multiple.some(c => c[0] === 'fillStyle' && c[1] === '#a48172'))
  assert.ok(multiple.some(c => c[0] === 'fillStyle' && c[1] === '#b9916d'))
  assert.equal(multiple.filter(c => c[0] === 'stop').length, 4)
})

test('each module opens to full-width glazing and daylight without changing circulation', () => {
  const commands = drawing(12)
  assert.equal(commands.filter(c => c[0] === 'roundRect' && c[3] === 584 && c[4] === 44).length, 2)
  assert.equal(commands.filter(c => c[0] === 'fillRect' && c[3] === 584 && c[4] === 207).length, 2)
})
