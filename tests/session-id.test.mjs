import test from 'node:test';
import assert from 'node:assert/strict';
import { isConversationId } from '../scripts/session-id.mjs';

test('accept exact canonical Codex IDs and reject the observed accidental extra suffix', () => {
  assert.equal(isConversationId('01a13e79-b4db-7863-a678-88b094f41f1b'), true);
  assert.equal(isConversationId('01a13e79-b4db-7863-a678-88b094f41f41f1b'), false);
  for (const value of [undefined, null, '', 'shared-conversation', '../thread', ' 01a13e79-b4db-7863-a678-88b094f41f1b']) assert.equal(isConversationId(value), false);
});
