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

test('publishPackages stamps the version, packs, publishes under the tag, and cleans up', () => {
  const root = project({ a: { name: '@acme/a', version: '0.0.0', dependencies: { x: 'workspace:*' } } });
  const dir = path.join(root, 'a');
  const calls = [];
  let npmrc = '';
  const exec = (cmd, args, opts) => {
    calls.push([cmd, ...args].join(' ').replace(/--userconfig \S+/, '--userconfig NPMRC'));
    assert.equal(opts.cwd, dir);
    if (args.includes('--userconfig')) npmrc = args[args.indexOf('--userconfig') + 1];
    if (args[0] === 'view') throw new Error("npm error code E404\nnpm error 404 Not Found");
    if (args[0] === 'pack') {
      assert.deepEqual(fs.readdirSync(dir).filter((f) => f.includes('npmrc')), [], 'no npmrc in the package dir while packing');
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, '1.5.0');
      fs.writeFileSync(path.join(dir, 'acme-a-1.5.0.tgz'), 'x');
      return 'acme-a-1.5.0.tgz\n';
    }
    if (args[0] === 'publish') assert.ok(fs.existsSync(npmrc));
    return '';
  };
  const out = publishPackages({ dirs: [{ dir, name: '@acme/a' }], version: '1.5.0', registryUrl: 'https://registry.vetra.io/', distTag: 'latest', token: 'tok' }, exec, () => {});
  assert.deepEqual(out, [{ name: '@acme/a', version: '1.5.0' }]);
  assert.deepEqual(calls, [
    'npm view @acme/a@1.5.0 version --registry https://registry.vetra.io --userconfig NPMRC',
    'pnpm pack',
    `npm publish ${path.join(dir, 'acme-a-1.5.0.tgz')} --registry https://registry.vetra.io --tag latest --userconfig NPMRC`,
  ]);
  assert.equal(fs.existsSync(npmrc), false);
  assert.equal(fs.existsSync(path.join(dir, 'acme-a-1.5.0.tgz')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')), { name: '@acme/a', version: '0.0.0', dependencies: { x: 'workspace:*' } });
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

test('only E404 from npm view means not published; other errors are rethrown and cleaned up', () => {
  const root = project({ a: { name: '@acme/a', version: '0.0.0' } });
  const dir = path.join(root, 'a');
  let npmrc = '';
  const exec = (cmd, args) => {
    npmrc = args[args.indexOf('--userconfig') + 1];
    throw new Error('npm error code E503\nService Unavailable');
  };
  assert.throws(() => publishPackages({ dirs: [{ dir, name: '@acme/a' }], version: '1.5.0', registryUrl: DEV_REGISTRY, distTag: 'x', token: 't' }, exec, () => {}), /E503/);
  assert.equal(fs.existsSync(npmrc), false);
});

test('distTagFor: a branch that is a semver range gets the branch- prefix', () => {
  const t = (branch) => distTagFor({ kind: 'build', version: '1.0.0-x.1', branch, pr: null, production: false });
  assert.equal(t('x'), 'branch-x');
  assert.equal(t('v2'), 'branch-v2');
  assert.equal(t('feature'), 'feature');
});

test('a package.json that cannot be read leaks no scratch dir (it holds the registry token)', () => {
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-scratch-'));
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = tmpdir;
  try {
    const dir = path.join(tmpdir, 'gone');
    assert.throws(() => publishPackages({ dirs: [{ dir, name: '@acme/gone' }], version: '1.5.0', registryUrl: DEV_REGISTRY, distTag: 'x', token: 't' }, () => '', () => {}), /ENOENT/);
    assert.deepEqual(fs.readdirSync(tmpdir), []);
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
});
