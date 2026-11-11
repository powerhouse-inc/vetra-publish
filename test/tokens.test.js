import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renownTokens } from '../src/tokens.js';

test('renownTokens: GitHub OIDC for renown.vetra.io, exchanged for the audience', async (t) => {
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    seen.push(String(url));
    if (String(url).startsWith('https://oidc')) return Response.json({ value: 'oidc-jwt' });
    assert.deepEqual(JSON.parse(init.body), { subject_token: 'oidc-jwt', audience: 'https://registry.vetra.io' });
    return Response.json({ access_token: 'renown-jwt' });
  });
  process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://oidc.example/token?x=1';
  process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN = 'req';
  t.after(() => {
    delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  });
  const get = renownTokens('https://renown.example/', 'https://registry.vetra.io');
  assert.equal(await get(), 'renown-jwt');
  assert.equal(await get(), 'renown-jwt');
  assert.deepEqual(seen, [
    'https://oidc.example/token?x=1&audience=https%3A%2F%2Frenown.vetra.io',
    'https://renown.example/api/@powerhousedao/renown-package/workload/token',
  ]);
});
