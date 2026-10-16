import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedModelPolicy, lockDispatch } from '../scripts/model-policy.mjs';

test('both tiers resolve to the exact V41 Flash ID and never auto-escalate', () => {
  assert.equal(fixedModelPolicy.flash_model, 'deepseek-flash');
  assert.equal(fixedModelPolicy.pro_model, 'deepseek-flash');
  assert.equal(fixedModelPolicy.tier_policy, 'flash-only');
  assert.equal(fixedModelPolicy.default_effort, 'max');
  assert.equal(fixedModelPolicy.escalate_on_failure, false);
});

test('an explicit Pro or lower effort dispatch cannot override the user policy', () => {
  assert.deepEqual(lockDispatch({ task: 'hello', tier: 'pro', effort: 'off' }), { task: 'hello', tier: 'flash', effort: 'max' });
  assert.throws(() => lockDispatch({ task: 'hello', worker: 'other-cli' }), /pins DSH/);
});
