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
