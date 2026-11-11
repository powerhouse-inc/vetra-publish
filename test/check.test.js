import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const script = path.resolve('src/check.js');
const run = (dir, ...args) => spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '', PATH: '/nonexistent' } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vp-check-'));

test('fails with the problem when the host Dockerfile is missing', () => {
  const r = run(tmp(), 'check');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^fail Publishing needs a host: hosts\/cli\/Dockerfile is missing/);
});

test('ok config without GitHub access reports next release unknown', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'hosts/cli'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hosts/cli/Dockerfile'), 'FROM node\n');
  fs.writeFileSync(path.join(dir, 'powerhouse.config.json'), '{}');
  const r = run(dir, 'check', '--branch', 'main');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ok {3}powerhouse\.config\.json: host cli \(hosts\/cli\/Dockerfile\)/);
  assert.match(r.stdout, /next release: unknown/);
});

test('unknown command exits 2', () => {
  assert.equal(run(tmp(), 'nope').status, 2);
});

import { nextReleaseLine } from '../src/check.js';

test('--branch without a value fails', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'hosts/cli'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hosts/cli/Dockerfile'), 'FROM node\n');
  const r = run(dir, 'check', '--branch');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--branch needs a branch name/);
});

test('no pending release PR: nothing to release, with the last release', async () => {
  const m = { buildPullRequests: async () => [], releasedVersions: { '.': '1.0.9' } };
  assert.equal(await nextReleaseLine(m, 'main'), 'ok   nothing to release from main (last release v1.0.9)');
});

test('a pending release PR: its version', async () => {
  const m = { buildPullRequests: async () => [{ version: '1.1.0' }], releasedVersions: { '.': '1.0.9' } };
  assert.match(await nextReleaseLine(m, 'main'), /^ok {3}next release from main: 1\.1\.0 /);
});

// npm runs the bin through a symlink (node_modules/.bin/vetra-publish): the
// bundled CLI must still recognise itself as the entry point.
test('the built CLI runs through a symlink, as npm installs the bin', () => {
  const dir = tmp();
  const link = path.join(dir, 'vetra-publish');
  fs.symlinkSync(path.resolve('dist/check/index.js'), link);
  const r = spawnSync(process.execPath, [link, 'nope'], { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /usage: vetra-publish check/);
  const direct = spawnSync(link, ['nope'], { cwd: dir, encoding: 'utf8' });
  assert.equal(direct.status, 2);
});
