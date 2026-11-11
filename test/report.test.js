import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseBody, summaryMarkdown } from '../src/report.js';

const D = `sha256:${'a'.repeat(64)}`;
const facts = {
  appId: 'app-1',
  version: '1.5.0',
  kind: 'release',
  branch: 'main',
  pr: null,
  commit: 'c0ffee',
  notes: '## Features',
  image: { ref: 'cr.vetra.io/acme/shop:1.5.0', digest: D, host: 'cli', extra: 'dropped' },
  packages: [{ name: '@acme/shop', version: '1.5.0', registryUrl: 'dropped' }],
  requires: { powerhouse: '>=6.2.3' },
  migrates: true,
  built: { powerhouse: '6.2.3', baseImage: `node:24@${D}` },
};

// Mirror of parseReleaseBody (vetra-cloud-package subgraphs/vetra-apps/ci.ts).
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v !== '';
function parses(b) {
  assert.ok(['release', 'build'].includes(b.kind));
  assert.ok(b.pr === null || Number.isInteger(b.pr));
  assert.equal(typeof b.migrates, 'boolean');
  assert.ok(Array.isArray(b.packages));
  for (const p of b.packages) assert.ok(isObj(p) && str(p.name) && str(p.version));
  assert.ok(isObj(b.requires));
  assert.ok(Object.keys(b.requires).every((k) => ['powerhouse', 'services', 'size'].includes(k)));
  for (const k of ['powerhouse', 'size']) assert.ok(b.requires[k] === undefined || typeof b.requires[k] === 'string');
  assert.ok(b.requires.services === undefined || (Array.isArray(b.requires.services) && b.requires.services.every((s) => typeof s === 'string')));
  assert.ok(b.branch === null || typeof b.branch === 'string');
  assert.ok(b.notes === null || typeof b.notes === 'string');
  assert.ok(str(b.appId) && str(b.version) && str(b.commit));
  assert.ok(isObj(b.image) && str(b.image.ref) && str(b.image.digest) && str(b.image.host));
  assert.ok(isObj(b.built) && str(b.built.powerhouse) && str(b.built.baseImage));
}

test('releaseBody is exactly what parseReleaseBody reads', () => {
  const b = releaseBody(facts);
  assert.deepEqual(b, {
    appId: 'app-1',
    version: '1.5.0',
    kind: 'release',
    branch: 'main',
    pr: null,
    commit: 'c0ffee',
    notes: '## Features',
    image: { ref: 'cr.vetra.io/acme/shop:1.5.0', digest: D, host: 'cli' },
    packages: [{ name: '@acme/shop', version: '1.5.0' }],
    requires: { powerhouse: '>=6.2.3' },
    migrates: true,
    built: { powerhouse: '6.2.3', baseImage: `node:24@${D}` },
  });
  parses(b);
});

test('a PR build: no branch, no notes, packages always an array', () => {
  const b = releaseBody({ ...facts, kind: 'build', version: '1.5.0-pr.12.3', branch: null, pr: 12, notes: 'x', packages: [] });
  assert.deepEqual([b.branch, b.pr, b.notes, b.packages], [null, 12, null, []]);
  parses(b);
});

test('requires keeps only powerhouse, services and size; migrates is a boolean', () => {
  const b = releaseBody({ ...facts, requires: { powerhouse: '>=6', services: ['a'], size: 'm', other: 1 }, migrates: undefined });
  assert.deepEqual(b.requires, { powerhouse: '>=6', services: ['a'], size: 'm' });
  assert.equal(b.migrates, false);
  assert.deepEqual(releaseBody({ ...facts, requires: undefined }).requires, {});
  parses(b);
});

test('summaryMarkdown names the version, image and packages', () => {
  const md = summaryMarkdown({ kind: 'release', version: '1.5.0', commit: 'c0ffee', image: facts.image, packages: facts.packages, migrates: true });
  assert.match(md, /### Vetra release 1\.5\.0/);
  assert.match(md, new RegExp(`cr\\.vetra\\.io/acme/shop:1\\.5\\.0@${D}`));
  assert.match(md, /@acme\/shop@1\.5\.0/);
});
