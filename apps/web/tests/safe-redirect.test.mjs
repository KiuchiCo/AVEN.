import assert from 'node:assert/strict';
import test from 'node:test';
import { safeRedirectUrl } from '../app/workspace/settings/safe-redirect.ts';

test('security: only web addresses are followed after the server hands one back', () => {
  assert.equal(safeRedirectUrl('https://checkout.example/pay/1', 'https://app.example/x'), 'https://checkout.example/pay/1');
  assert.equal(safeRedirectUrl('/workspace/settings', 'https://app.example/x'), 'https://app.example/workspace/settings');
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', undefined, 42, null]) assert.throws(() => safeRedirectUrl(bad, 'https://app.example/x'), /cannot be opened|Invalid URL/, String(bad));
});
