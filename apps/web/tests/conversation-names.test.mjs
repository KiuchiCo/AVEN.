import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conversationLabel } from '../app/workspace/messages/conversation-names.ts';

const p = (id, displayName) => ({ id, displayName });
test('channels show their name; direct and group conversations show the other people', () => {
  assert.equal(conversationLabel({ kind: 'CHANNEL', name: 'general', participants: [] }, 'me'), '# general');
  assert.equal(conversationLabel({ kind: 'DIRECT', name: null, participants: [p('me', 'Me'), p('b', 'Ben')] }, 'me'), 'Ben');
  assert.equal(conversationLabel({ kind: 'GROUP', name: null, participants: [p('me', 'Me'), p('b', 'Ben'), p('c', 'Cal')] }, 'me'), 'Ben and Cal');
  assert.equal(conversationLabel({ kind: 'GROUP', name: null, participants: [p('me', 'Me'), p('b', 'Ben'), p('c', 'Cal'), p('d', 'Dee')] }, 'me'), 'Ben, Cal and 1 other');
  assert.equal(conversationLabel({ kind: 'DIRECT', name: null, participants: [p('me', 'Me')] }, 'me'), 'Just you');
});
