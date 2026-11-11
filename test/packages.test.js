import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEV_REGISTRY, PRODUCTION_REGISTRY, distTagFor, publishPackages, publishableDirs, registryFor } from '../src/packages.js';

test('registryFor: the production registry only for pushes to release branches', () => {
  assert.equal(registryFor({ releaseBranch: true, event: 'push' }), PRODUCTION_REGISTRY);
  assert.equal(registryFor({ releaseBranch: false, event: 'push' }), DEV_REGISTRY);
  assert.equal(registryFor({ releaseBranch: true, event: 'pull_request' }), DEV_REGISTRY);
});

test('distTagFor', () => {
  const t = (o) => distTagFor({ branch: null, pr: null, production: false, ...o });
  assert.equal(t({ kind: 'release', version: '1.5.0', branch: 'main', production: true }), 'latest');
  assert.equal(t({ kind: 'release', version: '1.4.2', branch: '1.x' }), 'latest-1');
  assert.equal(t({ kind: 'release', version: '2.0.0-beta.1', branch: 'next' }), 'next');
  assert.equal(t({ kind: 'build', version: '1.5.0-main.3', branch: 'main', production: true }), 'main');
  assert.equal(t({ kind: 'build', version: '1.5.0-feat-x.3', branch: 'feat/x' }), 'feat-x');
  assert.equal(t({ kind: 'build', version: '2.0.0-beta.1-next.3', branch: 'next' }), 'branch-next');
  assert.equal(t({ kind: 'build', version: '1.4.2-b1-x.3', branch: '1.x' }), 'branch-1-x');
  assert.equal(t({ kind: 'build', version: '1.5.0-pr.12.3', pr: 12 }), 'pr-12');
});

function project(pkgs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-pkg-'));
  for (const [dir, pkg] of Object.entries(pkgs)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    if (pkg) fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify(pkg));
  }
  return root;
}

test('publishableDirs skips missing, private and unnamed packages', () => {
  const root = project({ a: { name: '@acme/a' }, b: { name: '@acme/b', private: true }, c: null, d: { version: '1.0.0' } });
  const warnings = [];
  const dirs = ['a', 'b', 'c', 'd'].map((d) => path.join(root, d));
  assert.deepEqual(publishableDirs(dirs, (m) => warnings.push(m)), [{ dir: dirs[0], name: '@acme/a' }]);
  assert.equal(warnings.length, 3);
});

test('publishPackages stamps the version, packs, publishes under the tag, and removes its .npmrc', () => {
  const root = project({ a: { name: '@acme/a', version: '0.0.0' } });
  const dir = path.join(root, 'a');
  const calls = [];
  const exec = (cmd, args, opts) => {
    calls.push([cmd, ...args].join(' '));
    assert.equal(opts.cwd, dir);
    if (args[0] === 'view') return '';
    if (args[0] === 'pack') return 'acme-a-1.5.0.tgz\n';
    return '';
  };
  const out = publishPackages({ dirs: [{ dir, name: '@acme/a' }], version: '1.5.0', registryUrl: 'https://registry.vetra.io/', distTag: 'latest', token: 'tok' }, exec, () => {});
  assert.deepEqual(out, [{ name: '@acme/a', version: '1.5.0' }]);
  const npmrc = path.join(dir, '.npmrc.vetra-publish');
  assert.deepEqual(calls, [
    `npm view @acme/a@1.5.0 version --registry https://registry.vetra.io --userconfig ${npmrc}`,
    'npm version 1.5.0 --no-git-tag-version --allow-same-version',
    'pnpm pack',
    `npm publish ${path.join(dir, 'acme-a-1.5.0.tgz')} --registry https://registry.vetra.io --tag latest --userconfig ${npmrc}`,
  ]);
  assert.equal(fs.existsSync(npmrc), false);
});

test('a version already in the registry (a re-run) is not published again but still reported', () => {
  const root = project({ a: { name: '@acme/a' } });
  const dir = path.join(root, 'a');
  const calls = [];
  const exec = (cmd, args) => (calls.push(args[0]), args[0] === 'view' ? '1.5.0\n' : '');
  const out = publishPackages({ dirs: [{ dir, name: '@acme/a' }], version: '1.5.0', registryUrl: PRODUCTION_REGISTRY, distTag: 'latest', token: 't' }, exec, () => {});
  assert.deepEqual(out, [{ name: '@acme/a', version: '1.5.0' }]);
  assert.deepEqual(calls, ['view']);
});
