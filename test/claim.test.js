import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workloadClaim } from '../src/claim.js';

const jwt = (payload) => `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;

test('reads refClass and releaseBranch from the vetra claim', () => {
  assert.deepEqual(workloadClaim(jwt({ vetra: { ref: 'refs/heads/next', refClass: 'BRANCH', releaseBranch: true } })), {
    refClass: 'BRANCH', production: false, releaseBranch: true,
  });
});

test('a Renown without the flag: only the production branch releases', () => {
  assert.equal(workloadClaim(jwt({ vetra: { refClass: 'PRODUCTION' } })).releaseBranch, true);
  assert.equal(workloadClaim(jwt({ vetra: { refClass: 'PREVIEW' } })).releaseBranch, false);
});

test('a token without a vetra claim is an error', () => {
  assert.throws(() => workloadClaim(jwt({ sub: 'x' })), /vetra claim/);
  assert.throws(() => workloadClaim('opaque'), /JWT/);
});
