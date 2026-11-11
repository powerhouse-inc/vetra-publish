// release-please 17 as a library: one config per release branch, computed
// here, so app repos carry no release-please config. Tags are plain
// v<version>, so an existing v1.0.9 tag counts as the last release.
//
// versioning "prerelease" on every branch: with prerelease off it turns
// 2.0.0-beta.3 + any change into 2.0.0 (the default strategy would propose
// 2.1.0-beta.3); with prereleaseType "<id>.0" a prerelease branch proposes
// 2.0.0-beta.0, then beta.1… ("beta" alone would give 2.0.0-beta, a build).
// A maintenance branch N.x uses "always-bump-minor" instead, so it stays in
// major N: a breaking change proposes the next minor (and so does a fix).

import { Errors, GitHub, Manifest } from 'release-please';
import { nextAfter } from './version.js';

export const ROOT = '.';

const API = 'https://api.github.com';

/** N for a maintenance branch `N.x`, else null. */
export function maintenanceMajor(branch) {
  const m = /^(0|[1-9]\d*)\.x$/.exec(branch ?? '');
  return m ? Number(m[1]) : null;
}

export function releaserConfig(prereleaseId, branch = null) {
  return {
    releaseType: 'node',
    versioning: maintenanceMajor(branch) === null ? 'prerelease' : 'always-bump-minor',
    includeComponentInTag: false,
    includeVInTag: true,
    changelogPath: 'CHANGELOG.md',
    ...(prereleaseId ? { prerelease: true, prereleaseType: `${prereleaseId}.0` } : {}),
  };
}

export async function openGitHub({ repository, token, branch }) {
  const [owner, repo] = repository.split('/');
  return GitHub.create({ owner, repo, token, defaultBranch: branch });
}

export function manifestFor(github, branch, prereleaseId) {
  return Manifest.fromConfig(github, branch, releaserConfig(prereleaseId, branch), {}, ROOT);
}

/** What the branch's release PR proposes (or would propose). */
export async function proposedVersion(manifest, prereleaseId) {
  const [pr] = await manifest.buildPullRequests();
  if (pr?.version) return pr.version.toString();
  return nextAfter(manifest.releasedVersions[ROOT]?.toString() ?? null, prereleaseId);
}

/**
 * Tags and releases every merged release PR of the branch (GitHub release
 * with its notes); returns the one at `sha`, i.e. this run's commit.
 * `notLatest(id)`, when given, is called for each GitHub release created
 * (releases off the production branch must not become GitHub's "Latest").
 * A release that already exists (a re-run) is a warning and null: the
 * caller then finds it with releaseAtCommit.
 */
export async function cutRelease(manifest, sha, { warn, notLatest }) {
  let created;
  try {
    created = (await manifest.createReleases()).filter(Boolean);
  } catch (e) {
    if (!(e instanceof Errors.DuplicateReleaseError)) throw e;
    warn(`release ${e.tag ?? ''} already exists (${e.message}): looking it up by its tag`);
    return null;
  }
  for (const r of created) {
    if (notLatest) await notLatest(r.id);
    if (r.sha !== sha) {
      warn(`release ${r.tagName} was tagged at ${r.sha}, not at this run's commit ${sha}: re-run the workflow run of ${String(r.sha).slice(0, 7)} to publish it`);
    }
  }
  const mine = created.find((r) => r.sha === sha);
  return mine ? { version: mine.version, notes: mine.notes ?? '' } : null;
}

async function gh(fetchImpl, token, path, init = {}) {
  return fetchImpl(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...init.headers },
  });
}

async function ghJson(fetchImpl, token, path, what) {
  const res = await gh(fetchImpl, token, path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${what} answered HTTP ${res.status}`);
  return res.json();
}

/**
 * A re-run after the release was cut: the GitHub release of tag v<version>
 * (the branch's latest release), if that tag points at `sha`.
 */
export async function releaseAtCommit({ repository, token, sha, version, fetchImpl = fetch }) {
  if (!version) return null;
  const tag = `v${version}`;
  const release = await ghJson(fetchImpl, token, `/repos/${repository}/releases/tags/${tag}`, `release ${tag} of ${repository}`);
  if (!release || release.draft) return null;
  const ref = await ghJson(fetchImpl, token, `/repos/${repository}/git/ref/tags/${tag}`, `tag ${tag} of ${repository}`);
  let object = ref?.object;
  if (object?.type === 'tag') {
    object = (await ghJson(fetchImpl, token, `/repos/${repository}/git/tags/${object.sha}`, `annotated tag ${tag} of ${repository}`))?.object;
  }
  if (object?.sha !== sha) return null;
  return { version, notes: release.body ?? '', id: release.id };
}

/** Keeps a release from becoming GitHub's "Latest" (maintenance and prerelease branches). */
export async function markNotLatest({ repository, token, id, fetchImpl = fetch }) {
  const res = await gh(fetchImpl, token, `/repos/${repository}/releases/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ make_latest: 'false' }),
  });
  if (!res.ok) throw new Error(`marking release ${id} of ${repository} not Latest answered HTTP ${res.status}`);
}
