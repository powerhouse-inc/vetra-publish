import { test } from 'node:test';
import assert from 'node:assert/strict';
import { githubToken, registryToken, reportRelease } from '../src/vetra-api.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('registry-token and github-token post the app id to their routes', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => (seen.push([url, init.body, init.headers.authorization]), json(200, { ok: true }));
  await registryToken('https://switchboard.vetra.io/', 'tok', 'app-1', { fetchImpl });
  await githubToken('https://switchboard.vetra.io', 'tok', 'app-1', { fetchImpl });
  const base = 'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps/ci';
  assert.deepEqual(seen, [
    [`${base}/registry-token`, '{"appId":"app-1"}', 'Bearer tok'],
    [`${base}/github-token`, '{"appId":"app-1"}', 'Bearer tok'],
  ]);
});

test('reportRelease retries SERVICE_UNAVAILABLE with a fresh token, then returns the record', async () => {
  let n = 0;
  const tokens = [];
  const fetchImpl = async (url, init) => {
    tokens.push(init.headers.authorization);
    return ++n === 1
      ? json(503, { error: 'SERVICE_UNAVAILABLE', message: 'Could not reach GitHub to verify the attestation; retry' })
      : json(200, { version: '1.5.0' });
  };
  let t = 0;
  const r = await reportRelease('https://v', async () => `t${++t}`, { version: '1.5.0' }, { fetchImpl, sleep: async () => {}, delays: [1] });
  assert.deepEqual(r, { version: '1.5.0' });
  assert.deepEqual(tokens, ['Bearer t1', 'Bearer t2']);
});

test('reportRelease explains VERSION_CONFLICT and does not retry verdicts', async () => {
  let n = 0;
  const conflict = async () => (n++, json(409, { error: 'VERSION_CONFLICT', message: '1.5.0 is already published with another image' }));
  await assert.rejects(reportRelease('https://v', async () => 't', { version: '1.5.0' }, { fetchImpl: conflict, sleep: async () => {} }), /tags are never moved/);
  assert.equal(n, 1);
  const forbidden = async () => json(403, { error: 'FORBIDDEN', message: 'nope' });
  await assert.rejects(reportRelease('https://v', async () => 't', {}, { fetchImpl: forbidden, sleep: async () => {} }), /FORBIDDEN: nope/);
});
