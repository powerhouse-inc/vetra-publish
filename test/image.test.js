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

test('a new tag is built from the host Dockerfile, pushed, and its digest read back', () => {
  const { exec, calls } = fakeExec([
    ['docker buildx imagetools inspect', new Error('not found')],
    ['docker inspect', `cr.vetra.io/acme/shop@${D}\n`],
  ]);
  assert.deepEqual(publishImage(target, exec), { name: 'cr.vetra.io/acme/shop', ref: 'cr.vetra.io/acme/shop:1.5.0', digest: D });
  const lines = calls.map((c) => c.line);
  assert.ok(lines.includes('docker build -f hosts/cli/Dockerfile --build-arg PH_HOST=cli --label org.opencontainers.image.version=1.5.0 -t cr.vetra.io/acme/shop:1.5.0 .'));
  assert.ok(lines.includes('docker push cr.vetra.io/acme/shop:1.5.0'));
});

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

test('baseImageDigest pins the base image, pulling it when the build did not', () => {
  let inspected = 0;
  const { exec, calls } = fakeExec([
    ['docker image inspect', () => (++inspected === 1 ? new Error('No such image') : `node@${B}\n`)],
  ]);
  assert.equal(baseImageDigest('node:24-bookworm-slim', exec), `node:24-bookworm-slim@${B}`);
  assert.ok(calls.some((c) => c.line === 'docker pull -q node:24-bookworm-slim'));
});

test('ociLabels', () => {
  assert.deepEqual(ociLabels({ version: '1.5.0', commit: 'c0ffee', repository: 'acme/shop', host: 'cli' }), {
    'org.opencontainers.image.version': '1.5.0',
    'org.opencontainers.image.revision': 'c0ffee',
    'org.opencontainers.image.source': 'https://github.com/acme/shop',
    'io.vetra.host': 'cli',
  });
});
