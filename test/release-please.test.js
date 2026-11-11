import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutRelease, proposedVersion, releaseAtCommit, releaserConfig } from '../src/release-please.js';

const v = (s) => ({ toString: () => s });

test('releaserConfig: node, plain v tags, prerelease versioning; <id>.0 on prerelease branches', () => {
  assert.deepEqual(releaserConfig(null), {
    releaseType: 'node',
    versioning: 'prerelease',
    includeComponentInTag: false,
    includeVInTag: true,
    changelogPath: 'CHANGELOG.md',
  });
  assert.deepEqual(releaserConfig('beta'), {
    ...releaserConfig(null),
    prerelease: true,
    prereleaseType: 'beta.0',
  });
});

test('proposedVersion: the release PR version, else one step after the latest release', async () => {
  assert.equal(await proposedVersion({ buildPullRequests: async () => [{ version: v('1.5.0') }], releasedVersions: {} }, null), '1.5.0');
  assert.equal(await proposedVersion({ buildPullRequests: async () => [], releasedVersions: { '.': v('2.0.0-beta.2') } }, 'beta'), '2.0.0-beta.3');
  assert.equal(await proposedVersion({ buildPullRequests: async () => [], releasedVersions: {} }, null), '0.1.0');
});

test('cutRelease returns the release tagged at this commit and warns about others', async () => {
  const warnings = [];
  const manifest = {
    createReleases: async () => [
      undefined,
      { sha: 'old', version: '1.4.1', notes: 'old', tagName: 'v1.4.1' },
      { sha: 'c0ffee', version: '1.5.0', notes: '## Features', tagName: 'v1.5.0' },
    ],
  };
  assert.deepEqual(await cutRelease(manifest, 'c0ffee', { warn: (m) => warnings.push(m) }), { version: '1.5.0', notes: '## Features' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /v1\.4\.1.*re-run/);
  assert.equal(await cutRelease({ createReleases: async () => [] }, 'c0ffee', { warn: () => {} }), null);
});

test('releaseAtCommit finds a published release whose tag points at this commit', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, auth: init.headers.authorization };
    return Response.json([
      { tag_name: 'v1.5.0', target_commitish: 'other', body: 'x', draft: false },
      { tag_name: 'v1.4.0', target_commitish: 'c0ffee', body: 'notes', draft: false },
    ]);
  };
  assert.deepEqual(await releaseAtCommit({ repository: 'acme/shop', token: 'ghs', sha: 'c0ffee', fetchImpl }), { version: '1.4.0', notes: 'notes' });
  assert.deepEqual(seen, { url: 'https://api.github.com/repos/acme/shop/releases?per_page=30', auth: 'Bearer ghs' });
  assert.equal(await releaseAtCommit({ repository: 'acme/shop', token: 'ghs', sha: 'none', fetchImpl }), null);
  await assert.rejects(
    releaseAtCommit({ repository: 'acme/shop', token: 'ghs', sha: 'c0ffee', fetchImpl: async () => new Response('', { status: 502 }) }),
    /502/,
  );
});
