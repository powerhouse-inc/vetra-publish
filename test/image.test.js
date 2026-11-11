import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseImageDigest, dockerLogin, ociLabels, powerhouseVersion, publishImage } from '../src/image.js';

const D = `sha256:${'a'.repeat(64)}`;
const B = `sha256:${'b'.repeat(64)}`;
/** exec double: the first matching prefix answers (a function, a string, or an Error to throw). */
function fakeExec(answers) {
  const calls = [];
  const exec = (cmd, args, opts = {}) => {
    const line = [cmd, ...args].join(' ');
    calls.push({ line, opts });
    for (const [prefix, out] of answers) {
      if (!line.startsWith(prefix)) continue;
      const v = typeof out === 'function' ? out(line, opts) : out;
      if (v instanceof Error) throw v;
      return v;
    }
    return '';
  };
  return { exec, calls };
}
const target = {
  registry: 'cr.vetra.io',
  repository: 'acme/shop',
  version: '1.5.0',
  host: 'cli',
  dockerfile: 'hosts/cli/Dockerfile',
  labels: { 'org.opencontainers.image.version': '1.5.0' },
};

test('dockerLogin sends the password on stdin, never as an argument', () => {
  const { exec, calls } = fakeExec([]);
  dockerLogin({ registry: 'cr.vetra.io', username: 'robot$acme+ci', password: 's3cret' }, exec);
  assert.equal(calls[0].line, 'docker login cr.vetra.io -u robot$acme+ci --password-stdin');
  assert.equal(calls[0].opts.input, 's3cret');
});

const NOT_FOUND = new Error("'docker buildx imagetools inspect' failed with exit code 1\nERROR: cr.vetra.io/acme/shop:1.5.0: not found");

test('a new tag is built from the host Dockerfile, pushed, and its registry digest read back', () => {
  let inspects = 0;
  const { exec, calls } = fakeExec([
    ['docker buildx imagetools inspect', () => (++inspects === 1 ? NOT_FOUND : JSON.stringify({ digest: D }))],
    // RepoDigests may list several (or no) entries; they are not the source of truth.
    ['docker inspect', `other/repo@${B}\n`],
  ]);
  assert.deepEqual(publishImage(target, exec), { name: 'cr.vetra.io/acme/shop', ref: 'cr.vetra.io/acme/shop:1.5.0', digest: D });
  const lines = calls.map((c) => c.line);
  assert.ok(lines.includes('docker build -f hosts/cli/Dockerfile --build-arg PH_HOST=cli --label org.opencontainers.image.version=1.5.0 -t cr.vetra.io/acme/shop:1.5.0 .'));
  assert.ok(lines.includes('docker push cr.vetra.io/acme/shop:1.5.0'));
  assert.ok(!lines.some((l) => l.includes('RepoDigests')));
});

test('a push the registry does not show is an error', () => {
  const { exec } = fakeExec([['docker buildx imagetools inspect', NOT_FOUND]]);
  assert.throws(() => publishImage(target, exec), /no digest/);
});

for (const msg of ['received unexpected HTTP status: 503 Service Unavailable', 'unauthorized: authentication required']) {
  test(`registry error (${msg.slice(0, 12)}…) is not "tag absent": no build, no push, error thrown`, () => {
    const { exec, calls } = fakeExec([['docker buildx imagetools inspect', new Error(`failed\n${msg}`)]]);
    assert.throws(() => publishImage(target, exec), /503|unauthorized/);
    assert.ok(!calls.some((c) => c.line.startsWith('docker build ') || c.line.startsWith('docker push ')));
  });
}

test('an existing tag (a re-run) is reused: tags are never moved', () => {
  const { exec, calls } = fakeExec([
    ['docker buildx imagetools inspect', JSON.stringify({ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: D, size: 1 })],
  ]);
  assert.equal(publishImage(target, exec).digest, D);
  assert.ok(!calls.some((c) => c.line.startsWith('docker build ') || c.line.startsWith('docker push ')));
});

test('powerhouseVersion reads ph-cli from the image', () => {
  const { exec, calls } = fakeExec([['docker run', '6.2.3\n']]);
  assert.equal(powerhouseVersion('cr.vetra.io/acme/shop:1.5.0', exec), '6.2.3');
  assert.match(calls[0].line, /^docker run --rm --entrypoint node cr\.vetra\.io\/acme\/shop:1\.5\.0 -p /);
  assert.throws(() => powerhouseVersion('x', fakeExec([['docker run', 'Error: Cannot find module']]).exec), /ph-cli/);
});

test('baseImageDigest resolves the base image from the registry (no pull, no RepoDigests)', () => {
  const { exec, calls } = fakeExec([['docker buildx imagetools inspect', JSON.stringify({ digest: B })]]);
  assert.equal(baseImageDigest('node:24-bookworm-slim', exec), `node:24-bookworm-slim@${B}`);
  assert.ok(!calls.some((c) => c.line.includes('RepoDigests') || c.line.startsWith('docker pull')));
});

test('baseImageDigest keeps an image that is already pinned', () => {
  const { exec, calls } = fakeExec([]);
  assert.equal(baseImageDigest(`node:24@${B}`, exec), `node:24@${B}`);
  assert.equal(calls.length, 0);
});

test('dockerLogin masks the password in the workflow log', () => {
  const { exec } = fakeExec([]);
  const writes = [];
  const orig = process.stdout.write;
  process.stdout.write = (c) => (writes.push(String(c)), true);
  try { dockerLogin({ registry: 'r', username: 'u', password: 'pw123' }, exec); } finally { process.stdout.write = orig; }
  assert.ok(writes.includes('::add-mask::pw123\n'));
});

test('ociLabels', () => {
  assert.deepEqual(ociLabels({ version: '1.5.0', commit: 'c0ffee', repository: 'acme/shop', host: 'cli' }), {
    'org.opencontainers.image.version': '1.5.0',
    'org.opencontainers.image.revision': 'c0ffee',
    'org.opencontainers.image.source': 'https://github.com/acme/shop',
    'io.vetra.host': 'cli',
  });
});
