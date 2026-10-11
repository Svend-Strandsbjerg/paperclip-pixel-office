import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentStep, gateLabels } from '../src/pipeline-view'
import { demoDeliveries, type GateState } from '../src/pipeline'

test('current step follows active/rework/blockers, pending gates, human readiness and merged state', () => {
  const d = structuredClone(demoDeliveries[0])
  assert.equal(currentStep(d), 3)
  for (const state of ['waiting', 'active', 'rework', 'blocked', 'unknown', 'invalidated'] as GateState[]) {
    d.gates[1].state = state
    assert.equal(currentStep(d), 1)
    assert.ok(gateLabels[state])
  }
  d.gates[0].state = 'invalidated'
  d.gates[1].state = 'active'
  assert.equal(currentStep(d), 1)
  d.merge = 'merged'
  assert.equal(currentStep(d), -1)
})
