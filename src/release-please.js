// release-please 17 as a library: one config per release branch, computed
// here, so app repos carry no release-please config. Tags are plain
// v<version>, so an existing v1.0.9 tag counts as the last release.
//
// versioning "prerelease" on every branch: with prerelease off it turns
// 2.0.0-beta.3 + any change into 2.0.0 (the default strategy would propose
// 2.1.0-beta.3); with prereleaseType "<id>.0" a prerelease branch proposes
// 2.0.0-beta.0, then beta.1… ("beta" alone would give 2.0.0-beta, a build).

import { GitHub, Manifest } from 'release-please';
import { nextAfter } from './version.js';

export const ROOT = '.';

export function releaserConfig(prereleaseId) {
  return {
    releaseType: 'node',
    versioning: 'prerelease',
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
  return Manifest.fromConfig(github, branch, releaserConfig(prereleaseId), {}, ROOT);
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
 */
export async function cutRelease(manifest, sha, { warn }) {
  const created = (await manifest.createReleases()).filter(Boolean);
  for (const r of created) {
    if (r.sha !== sha) {
      warn(`release ${r.tagName} was tagged at ${r.sha}, not at this run's commit ${sha}: re-run the workflow run of ${String(r.sha).slice(0, 7)} to publish it`);
    }
  }
  const mine = created.find((r) => r.sha === sha);
  return mine ? { version: mine.version, notes: mine.notes ?? '' } : null;
}

/** A re-run after the release was cut: the GitHub release whose tag points at `sha`. */
export async function releaseAtCommit({ repository, token, sha, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=30`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub releases of ${repository} answered HTTP ${res.status}`);
  const releases = await res.json();
  const hit = releases.find((r) => r.target_commitish === sha && /^v\d/.test(r.tag_name ?? '') && !r.draft);
  return hit ? { version: hit.tag_name.slice(1), notes: hit.body ?? '' } : null;
}
