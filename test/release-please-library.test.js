// The real release-please 17 behind src/release-please.js, offline: a GitHub
// from openGitHub whose API calls are replaced by an in-memory repository.
// These pin the behaviour the per-branch config relies on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setLogger } from 'release-please';
import { cutRelease, manifestFor, openGitHub, proposedVersion } from '../src/release-please.js';

const quiet = { error() {}, warn() {}, info() {}, debug() {}, trace() {}, child() { return quiet; } };
let realFetch;
before(() => {
  setLogger(quiet);
  realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    throw new Error(`network call in an offline test: ${url}`);
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

const commit = (sha, message, pullRequest) => ({ sha, message, files: ['src/index.js'], pullRequest });

/**
 * A repository on `branch`: `releases` are GitHub releases ({tagName, sha}),
 * `tags` bare tags ({name, sha}), `commits` newest first.
 */
async function repo({ branch = 'main', releases = [], tags = [], commits = [], pullRequests = [] }) {
  const github = await openGitHub({ repository: 'acme/shop', token: 'ghs', branch });
  const created = [];
  const labels = [];
  Object.assign(github, {
    async *releaseIterator() {
      for (const r of releases) yield { name: r.tagName, notes: '', url: '', ...r };
    },
    async *tagIterator() {
      yield* tags;
    },
    async *mergeCommitIterator() {
      yield* commits;
    },
    async *pullRequestIterator(_branch, status) {
      if (status === 'MERGED') yield* pullRequests;
    },
    async getFileContentsOnBranch(path) {
      if (path === 'package.json') {
        const parsedContent = JSON.stringify({ name: 'shop', version: '0.0.0' });
        return { parsedContent, content: Buffer.from(parsedContent).toString('base64'), sha: 'x', mode: '100644' };
      }
      const { FileNotFoundError } = await import('release-please/build/src/errors/index.js');
      throw new FileNotFoundError(path);
    },
    async findFilesByFilenameAndRef() {
      return [];
    },
    async findFilesByGlobAndRef() {
      return [];
    },
    async createRelease(release) {
      created.push(release);
      return { id: created.length, tagName: release.tag.toString(), sha: release.sha, notes: release.notes, url: '' };
    },
    async commentOnIssue() {},
    async removeIssueLabels(l, n) {
      labels.push(['remove', n, l]);
    },
    async addIssueLabels(l, n) {
      labels.push(['add', n, l]);
    },
  });
  return { github, created, labels };
}

/** The proposal, checking it is the library's release PR (not the fallback) unless `none`. */
const propose = async (opts, prereleaseId, { none = false } = {}) => {
  const { github } = await repo(opts);
  const manifest = await manifestFor(github, opts.branch ?? 'main', prereleaseId);
  const prs = await manifest.buildPullRequests();
  assert.equal(prs.length, none ? 0 : 1);
  const proposed = await proposedVersion(manifest, prereleaseId);
  if (!none) assert.equal(proposed, prs[0].version.toString());
  return proposed;
};

test('main: a feature after v1.4.0 proposes 1.5.0', async () => {
  assert.equal(
    await propose({ releases: [{ tagName: 'v1.4.0', sha: 'r1' }], commits: [commit('c2', 'feat: cart'), commit('r1', 'chore: release 1.4.0')] }, null),
    '1.5.0',
  );
});

test('prerelease branch: a breaking change after v1.4.0 proposes 2.0.0-beta.0, then beta.1', async () => {
  assert.equal(
    await propose(
      { branch: 'beta', releases: [{ tagName: 'v1.4.0', sha: 'r1' }], commits: [commit('c2', 'feat!: new cart'), commit('r1', 'chore: release 1.4.0')] },
      'beta',
    ),
    '2.0.0-beta.0',
  );
  assert.equal(
    await propose(
      { branch: 'beta', releases: [{ tagName: 'v2.0.0-beta.0', sha: 'r2' }], commits: [commit('c3', 'feat: coupons'), commit('r2', 'chore: release 2.0.0-beta.0')] },
      'beta',
    ),
    '2.0.0-beta.1',
  );
});

test('main after a beta: 2.0.0-beta.3 plus a feature proposes 2.0.0', async () => {
  assert.equal(
    await propose({ releases: [{ tagName: 'v2.0.0-beta.3', sha: 'r3' }], commits: [commit('c4', 'feat: coupons'), commit('r3', 'chore: release')] }, null),
    '2.0.0',
  );
});

test('a bare v1.0.9 tag, without a GitHub release, counts as the last release', async () => {
  assert.equal(
    await propose({ tags: [{ name: 'v1.0.9', sha: 't1' }], commits: [commit('c5', 'fix: rounding'), commit('t1', 'chore: 1.0.9')] }, null),
    '1.0.10',
  );
});

test('no changes since the last release: no release PR, the fallback proposes one step on', async () => {
  assert.equal(await propose({ releases: [{ tagName: 'v1.4.0', sha: 'r1' }], commits: [commit('r1', 'chore: release 1.4.0')] }, null, { none: true }), '1.4.1');
});

test('cutRelease on a merged release PR: tags v<version> at its merge commit, with the notes', async () => {
  // The release PR exactly as release-please proposes it on main, then merged at c0ffee.
  const before = await repo({ releases: [{ tagName: 'v1.4.0', sha: 'r1' }], commits: [commit('c2', 'feat: cart'), commit('r1', 'chore: release 1.4.0')] });
  const [proposal] = await (await manifestFor(before.github, 'main', null)).buildPullRequests();
  const pr = {
    number: 7,
    title: proposal.title.toString(),
    body: proposal.body.toString(),
    labels: proposal.labels,
    headBranchName: proposal.headRefName,
    baseBranchName: 'main',
    sha: 'c0ffee',
    files: [],
  };
  const { github, created, labels } = await repo({ pullRequests: [pr] });
  const manifest = await manifestFor(github, 'main', null);
  const warnings = [];
  const { release: got } = await cutRelease(manifest, 'c0ffee', { warn: (m) => warnings.push(m), alert: (m) => warnings.push(m) });
  assert.equal(got.version, '1.5.0');
  assert.match(got.notes, /### Features\n\n\* cart/);
  assert.deepEqual(warnings, []);
  assert.equal(created.length, 1);
  assert.equal(created[0].tag.toString(), 'v1.5.0');
  assert.deepEqual(labels, [
    ['remove', 7, ['autorelease: pending']],
    ['add', 7, ['autorelease: tagged']],
  ]);
});

test('maintenance branch 1.x ships patches: fix, feat and feat! after v1.4.2 all propose 1.4.3', async () => {
  const opts = (message) => ({ branch: '1.x', releases: [{ tagName: 'v1.4.2', sha: 'r1' }], commits: [commit('c2', message), commit('r1', 'chore: release 1.4.2')] });
  assert.equal(await propose(opts('feat!: new cart'), null), '1.4.3');
  assert.equal(await propose(opts('feat: coupons'), null), '1.4.3');
  assert.equal(await propose(opts('fix: rounding'), null), '1.4.3');
});
