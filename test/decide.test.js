import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideVersion } from '../src/decide.js';

const v = (s) => ({ toString: () => s });
function fakeManifest({ created = [], proposal = null, latest = null } = {}) {
  const calls = [];
  return {
    calls,
    releasedVersions: latest ? { '.': v(latest) } : {},
    createReleases: async () => (calls.push('createReleases'), created),
    createPullRequests: async () => (calls.push('createPullRequests'), []),
    buildPullRequests: async () => (calls.push('buildPullRequests'), proposal ? [{ version: v(proposal) }] : []),
  };
}
function fakes(manifests, extra = {}) {
  const seen = { vetraTokens: 0, manifests: [] };
  const deps = {
    openGitHub: async ({ token, branch }) => ({ token, branch }),
    manifestFor: async (github, branch, prereleaseId) => {
      seen.manifests.push({ token: github.token, branch, prereleaseId });
      return manifests.shift();
    },
    githubToken: async () => ((seen.vetraTokens += 1), { token: 'ghs_release', expiresAt: 'x' }),
    releaseAtCommit: async () => null,
    warn: () => {},
    ...extra,
  };
  return { deps, seen };
}
const input = { appId: 'app-1', vetraUrl: 'https://v', githubToken: 'ghs_run' };
const config = { prerelease: { next: 'beta' } };
const appsToken = async () => 'renown';
const push = (branch) => ({ event: 'push', branch, pr: null, target: branch, sha: 'c0ffee', repository: 'acme/shop', runNumber: '37' });
const releaseBranch = { releaseBranch: true };

test('a merged release PR on a release branch is the release; the next release PR is opened', async () => {
  const cut = fakeManifest({ created: [{ sha: 'c0ffee', version: '1.5.0', notes: '## Features', tagName: 'v1.5.0' }] });
  const next = fakeManifest();
  const { deps, seen } = fakes([cut, next]);
  const r = await decideVersion({ run: push('main'), claim: releaseBranch, config, appsToken, input }, deps);
  assert.deepEqual(r, { kind: 'release', version: '1.5.0', notes: '## Features' });
  assert.deepEqual(cut.calls, ['createReleases']);
  assert.deepEqual(next.calls, ['createPullRequests']);
  assert.equal(seen.vetraTokens, 1);
  assert.deepEqual(seen.manifests[0], { token: 'ghs_release', branch: 'main', prereleaseId: null });
});

test('any other push to a release branch builds the proposed version and updates the release PR', async () => {
  const next = fakeManifest({ proposal: '1.5.0' });
  const { deps } = fakes([fakeManifest(), next]);
  const r = await decideVersion({ run: push('main'), claim: releaseBranch, config, appsToken, input }, deps);
  assert.deepEqual(r, { kind: 'build', version: '1.5.0-main.37', notes: null });
  assert.deepEqual(next.calls, ['createPullRequests', 'buildPullRequests']);
});

test('a prerelease branch proposes with its identifier', async () => {
  const { deps, seen } = fakes([fakeManifest(), fakeManifest({ proposal: '2.0.0-beta.2' })]);
  const r = await decideVersion({ run: push('next'), claim: releaseBranch, config, appsToken, input }, deps);
  assert.equal(r.version, '2.0.0-beta.2-next.37');
  assert.equal(seen.manifests[0].prereleaseId, 'beta');
});

test('a re-run after the release was cut reports the release again', async () => {
  const { deps } = fakes([fakeManifest(), fakeManifest()], {
    releaseAtCommit: async ({ sha, token }) => (sha === 'c0ffee' && token === 'ghs_release' ? { version: '1.5.0', notes: 'n' } : null),
  });
  const r = await decideVersion({ run: push('main'), claim: releaseBranch, config, appsToken, input }, deps);
  assert.deepEqual(r, { kind: 'release', version: '1.5.0', notes: 'n' });
});

test('a released version Vetra would read as a build is refused', async () => {
  const cut = fakeManifest({ created: [{ sha: 'c0ffee', version: '2.0.0-beta', notes: '', tagName: 'v2.0.0-beta' }] });
  const { deps } = fakes([cut, fakeManifest()]);
  await assert.rejects(
    decideVersion({ run: push('next'), claim: releaseBranch, config, appsToken, input }, deps),
    /alpha\.N, beta\.N or rc\.N/,
  );
});

test('pull requests build from the target branch with the run token; Vetra is not asked for a GitHub token', async () => {
  const { deps, seen } = fakes([fakeManifest({ proposal: '2.0.0-beta.2' })]);
  const run = { event: 'pull_request', branch: null, pr: 12, target: 'next', sha: 'm3rge', repository: 'acme/shop', runNumber: '3' };
  const r = await decideVersion({ run, claim: { releaseBranch: false }, config, appsToken, input }, deps);
  assert.deepEqual(r, { kind: 'build', version: '2.0.0-beta.2-pr.12.3', notes: null });
  assert.equal(seen.vetraTokens, 0);
  assert.deepEqual(seen.manifests, [{ token: 'ghs_run', branch: 'next', prereleaseId: 'beta' }]);
});

test('a push to another branch builds from its own history', async () => {
  const { deps, seen } = fakes([fakeManifest({ latest: '1.4.0' })]);
  const r = await decideVersion({ run: push('feat/login'), claim: { releaseBranch: false }, config, appsToken, input }, deps);
  assert.equal(r.version, '1.4.1-feat-login.37');
  assert.equal(seen.vetraTokens, 0);
});

test('a build without the run token is a clear error', async () => {
  const { deps } = fakes([]);
  await assert.rejects(
    decideVersion({ run: push('feat/x'), claim: { releaseBranch: false }, config, appsToken, input: { ...input, githubToken: '' } }, deps),
    /github-token/,
  );
});
