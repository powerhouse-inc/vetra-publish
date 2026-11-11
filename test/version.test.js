import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchIdent, buildVersion, compareReleases, nextAfter, versionKind } from '../src/version.js';

test('versionKind follows Vetra: alpha|beta|rc.N are releases, anything else a build', () => {
  assert.equal(versionKind('1.4.0'), 'release');
  assert.equal(versionKind('2.0.0-beta.1'), 'release');
  assert.equal(versionKind('2.0.0-rc.0'), 'release');
  assert.equal(versionKind('2.0.0-beta'), 'build');
  assert.equal(versionKind('1.4.0-main.37'), 'build');
  assert.equal(versionKind('2.0.0-beta.2-next.12'), 'build');
  assert.equal(versionKind('01.0.0'), null);
  assert.equal(versionKind('1.0.0+meta'), null);
});

test('compareReleases orders by semver, a prerelease before its release', () => {
  const sorted = ['2.0.0', '1.4.1', '2.0.0-beta.10', '2.0.0-beta.2', '2.0.0-rc.0'].sort(compareReleases);
  assert.deepEqual(sorted, ['1.4.1', '2.0.0-beta.2', '2.0.0-beta.10', '2.0.0-rc.0', '2.0.0']);
  assert.throws(() => compareReleases('1.0.0', '1.0.0-main.1'), /build/);
});

test('branchIdent makes a branch one prerelease identifier that is never a release marker', () => {
  assert.equal(branchIdent('main'), 'main');
  assert.equal(branchIdent('feat/login_page'), 'feat-login-page');
  assert.equal(branchIdent('1.x'), '1-x');
  assert.equal(branchIdent('2024'), 'b2024');
  assert.equal(branchIdent('beta'), 'branch-beta');
  assert.equal(branchIdent('///'), 'branch');
  assert.equal(branchIdent('x'.repeat(80)).length, 40);
});

test('buildVersion: <proposed>-<branch>.<run> and <proposed>-pr.<n>.<run>, always a build', () => {
  assert.equal(buildVersion('1.4.0', { branch: 'main', pr: null, runNumber: '37' }), '1.4.0-main.37');
  assert.equal(buildVersion('2.0.0-beta.2', { branch: 'next', pr: null, runNumber: 12 }), '2.0.0-beta.2-next.12');
  assert.equal(buildVersion('1.4.0', { branch: null, pr: 12, runNumber: '3' }), '1.4.0-pr.12.3');
  assert.equal(buildVersion('1.4.0', { branch: 'rc', pr: null, runNumber: '5' }), '1.4.0-branch-rc.5');
  assert.throws(() => buildVersion('1.4', { branch: 'main', pr: null, runNumber: '1' }), /not semver/);
  assert.throws(() => buildVersion('1.4.0', { branch: 'main', pr: null, runNumber: '0' }), /run number/);
});

test('nextAfter: one step after the latest release when release-please proposes nothing', () => {
  assert.equal(nextAfter(null, null), '0.1.0');
  assert.equal(nextAfter(null, 'beta'), '0.1.0-beta.0');
  assert.equal(nextAfter('1.4.0', null), '1.4.1');
  assert.equal(nextAfter('1.4.0', 'beta'), '1.4.1-beta.0');
  assert.equal(nextAfter('2.0.0-beta.3', 'beta'), '2.0.0-beta.4');
  assert.equal(nextAfter('2.0.0-beta.3', null), '2.0.0');
});
