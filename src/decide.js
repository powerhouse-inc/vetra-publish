// Release or build, and the version (releases spec, section 3).
//
// A push to a release branch (Renown's releaseBranch on the workload token;
// Vetra checks it again) acts as the Vetra GitHub App: it tags and releases
// a merged release PR, then opens or updates the branch's next release PR.
// Every other run reads its target branch's proposal with the run's own
// token, and builds.

import {
  cutRelease,
  maintenanceMajor,
  manifestFor as realManifestFor,
  markNotLatest as realMarkNotLatest,
  openGitHub as realOpenGitHub,
  proposedVersion,
  ROOT,
  releaseAtCommit as realReleaseAtCommit,
} from './release-please.js';
import { githubToken as realGithubToken } from './vetra-api.js';
import { appendSummary, errorAnnotation, mask, warning } from './util.js';
import { buildVersion, parseVersion, versionKind } from './version.js';

/** An error annotation plus a job-summary line: something only a person can fix. */
function realAlert(message) {
  errorAnnotation(message);
  appendSummary(`**Vetra:** ${message}\n\n`);
}

/** A maintenance branch N.x only ever releases N.y.z. */
function inMajor(branch, version) {
  const major = maintenanceMajor(branch);
  if (major !== null && parseVersion(version)?.major !== major) {
    throw new Error(
      `release-please proposes ${version} on the maintenance branch ${branch}, which only releases major ${major}: release ${version} from the production branch instead`,
    );
  }
  return version;
}

export async function decideVersion({ run, claim, config, appsToken, input }, deps = {}) {
  const {
    openGitHub = realOpenGitHub,
    manifestFor = realManifestFor,
    githubToken = realGithubToken,
    releaseAtCommit = realReleaseAtCommit,
    markNotLatest = realMarkNotLatest,
    warn = warning,
    alert = realAlert,
  } = deps;
  const prereleaseId = config.prerelease[run.target] ?? null;

  if (run.event === 'push' && claim.releaseBranch) {
    // Only the production branch's releases become GitHub's "Latest".
    const offMain = !claim.production;
    if (offMain && prereleaseId === null && maintenanceMajor(run.branch) === null) {
      // Its releases would take main's versions and become GitHub's "Latest".
      throw new Error(
        `release branch ${run.branch} is not the production branch, a prerelease branch (vetra.prerelease in powerhouse.config.json) or a maintenance branch N.x: Vetra releases nothing from it`,
      );
    }
    const { token } = await githubToken(input.vetraUrl, await appsToken(), input.appId);
    mask(token);
    const github = await openGitHub({ repository: run.repository, token, branch: run.branch });
    const notLatest = offMain ? (id) => markNotLatest({ repository: run.repository, token, id }) : undefined;
    const manifest = await manifestFor(github, run.branch, prereleaseId);
    const cut = await cutRelease(manifest, run.sha, { warn, alert, notLatest });
    // Read after the release: its history includes what this run (or a run
    // that raced it) just released.
    const next = await manifestFor(github, run.branch, prereleaseId);
    let released = cut.release;
    if (!released) {
      // A re-run, or another run cut this commit's release first: the
      // branch's latest release, if its tag points at this commit.
      const latest = [next, manifest].map((m) => m.releasedVersions[ROOT]?.toString() ?? null);
      for (const version of new Set(latest.filter(Boolean))) {
        released = await releaseAtCommit({ repository: run.repository, token, sha: run.sha, version });
        if (released) break;
      }
      if (released && notLatest) await notLatest(released.id);
      if (!released && cut.duplicate) {
        alert(
          `another run released v${latest[0]} while this one tried to, and its tag is not at this commit ${run.sha}: if this commit merged the release PR, re-run this workflow run so Vetra gets the release`,
        );
      }
    }
    // After a release this starts the next release PR; otherwise it brings
    // the open one up to date with this push.
    await next.createPullRequests();
    if (released) {
      if (versionKind(released.version) !== 'release') {
        throw new Error(
          `release-please released ${released.version}, which Vetra reads as a build: a prerelease must be alpha.N, beta.N or rc.N (vetra.prerelease in powerhouse.config.json)`,
        );
      }
      inMajor(run.branch, released.version);
      return { kind: 'release', version: released.version, notes: released.notes };
    }
    return { kind: 'build', version: buildVersion(inMajor(run.branch, await proposedVersion(next, prereleaseId)), run), notes: null };
  }

  if (!input.githubToken) {
    throw new Error("input 'github-token' is empty: it defaults to the run's own token, which reads the release history");
  }
  const github = await openGitHub({ repository: run.repository, token: input.githubToken, branch: run.target });
  const proposed = inMajor(run.target, await proposedVersion(await manifestFor(github, run.target, prereleaseId), prereleaseId));
  return { kind: 'build', version: buildVersion(proposed, run), notes: null };
}
