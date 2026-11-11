import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Errors } from 'release-please';
import { cutRelease, maintenanceMajor, markNotLatest, proposedVersion, releaseAtCommit, releaserConfig } from '../src/release-please.js';

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

test('maintenance branches N.x bump minor at most, so they stay in their major', () => {
  assert.equal(maintenanceMajor('1.x'), 1);
  assert.equal(maintenanceMajor('12.x'), 12);
  assert.equal(maintenanceMajor('main'), null);
  assert.equal(maintenanceMajor('1.x-fix'), null);
  assert.deepEqual(releaserConfig(null, '1.x'), { ...releaserConfig(null), versioning: 'always-bump-minor' });
  assert.deepEqual(releaserConfig(null, 'main'), releaserConfig(null));
  assert.deepEqual(releaserConfig('beta', 'next'), releaserConfig('beta'));
});

test('cutRelease: a release that already exists is a warning and no release, for the re-run lookup', async () => {
  const warnings = [];
  const manifest = {
    createReleases: async () => {
      throw new Errors.DuplicateReleaseError({ status: 422 }, 'tagName');
    },
  };
  assert.equal(await cutRelease(manifest, 'c0ffee', { warn: (m) => warnings.push(m) }), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /already/);
  await assert.rejects(
    cutRelease({ createReleases: async () => { throw new Error('boom'); } }, 'c0ffee', { warn: () => {} }),
    /boom/,
  );
});

test('cutRelease: notLatest is called for every release it creates', async () => {
  const marked = [];
  const manifest = {
    createReleases: async () => [
      { id: 1, sha: 'old', version: '1.4.1', notes: '', tagName: 'v1.4.1' },
      { id: 2, sha: 'c0ffee', version: '1.5.0', notes: 'n', tagName: 'v1.5.0' },
    ],
  };
  await cutRelease(manifest, 'c0ffee', { warn: () => {}, notLatest: async (id) => marked.push(id) });
  assert.deepEqual(marked, [1, 2]);
});

test('markNotLatest: PATCH the release with make_latest false', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, method: init.method, auth: init.headers.authorization, body: JSON.parse(init.body) };
    return Response.json({});
  };
  await markNotLatest({ repository: 'acme/shop', token: 'ghs', id: 42, fetchImpl });
  assert.deepEqual(seen, { url: 'https://api.github.com/repos/acme/shop/releases/42', method: 'PATCH', auth: 'Bearer ghs', body: { make_latest: 'false' } });
  await assert.rejects(markNotLatest({ repository: 'acme/shop', token: 'ghs', id: 42, fetchImpl: async () => new Response('', { status: 403 }) }), /403/);
});

/** GitHub with the release `v<version>` whose tag (lightweight or annotated) points at `commit`. */
function tagApi({ version, commit, annotated = false, status = {} }) {
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers.authorization, 'Bearer ghs');
    const path = url.replace('https://api.github.com/repos/acme/shop', '');
    if (status[path]) return new Response('', { status: status[path] });
    if (path === `/releases/tags/v${version}`) return Response.json({ id: 9, tag_name: `v${version}`, body: 'notes', draft: false });
    if (path === `/git/ref/tags/v${version}`) return Response.json({ object: annotated ? { type: 'tag', sha: 'tagobj' } : { type: 'commit', sha: commit } });
    if (path === '/git/tags/tagobj') return Response.json({ object: { type: 'commit', sha: commit } });
    return new Response('', { status: 404 });
  };
  return { fetchImpl, urls };
}

test('releaseAtCommit: the release of tag v<version>, when the tag points at this commit', async () => {
  const at = (api, sha, version = '1.5.0') => releaseAtCommit({ repository: 'acme/shop', token: 'ghs', sha, version, fetchImpl: api.fetchImpl });
  const light = tagApi({ version: '1.5.0', commit: 'c0ffee' });
  assert.deepEqual(await at(light, 'c0ffee'), { version: '1.5.0', notes: 'notes', id: 9 });
  assert.deepEqual(light.urls, [
    'https://api.github.com/repos/acme/shop/releases/tags/v1.5.0',
    'https://api.github.com/repos/acme/shop/git/ref/tags/v1.5.0',
  ]);
  assert.deepEqual(await at(tagApi({ version: '1.5.0', commit: 'c0ffee', annotated: true }), 'c0ffee'), { version: '1.5.0', notes: 'notes', id: 9 });
  assert.equal(await at(light, 'other'), null);
  assert.equal(await at(light, 'c0ffee', '1.6.0'), null);
  assert.equal(await releaseAtCommit({ repository: 'acme/shop', token: 'ghs', sha: 'c0ffee', version: null, fetchImpl: light.fetchImpl }), null);
  await assert.rejects(at(tagApi({ version: '1.5.0', commit: 'c0ffee', status: { '/releases/tags/v1.5.0': 502 } }), 'c0ffee'), /502/);
  await assert.rejects(at(tagApi({ version: '1.5.0', commit: 'c0ffee', status: { '/git/ref/tags/v1.5.0': 500 } }), 'c0ffee'), /500/);
});
