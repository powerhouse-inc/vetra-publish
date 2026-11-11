// Release or build, and the version (releases spec, section 3).
//
// A push to a release branch (Renown's releaseBranch on the workload token;
// Vetra checks it again) acts as the Vetra GitHub App: it tags and releases
// a merged release PR, then opens or updates the branch's next release PR.
// Every other run reads its target branch's proposal with the run's own
// token, and builds.

import {
  cutRelease,
  manifestFor as realManifestFor,
  openGitHub as realOpenGitHub,
  proposedVersion,
  releaseAtCommit as realReleaseAtCommit,
} from './release-please.js';
import { githubToken as realGithubToken } from './vetra-api.js';
import { mask, warning } from './util.js';
import { buildVersion, versionKind } from './version.js';

export async function decideVersion({ run, claim, config, appsToken, input }, deps = {}) {
  const {
    openGitHub = realOpenGitHub,
    manifestFor = realManifestFor,
    githubToken = realGithubToken,
    releaseAtCommit = realReleaseAtCommit,
    warn = warning,
  } = deps;
  const prereleaseId = config.prerelease[run.target] ?? null;

  if (run.event === 'push' && claim.releaseBranch) {
    const { token } = await githubToken(input.vetraUrl, await appsToken(), input.appId);
    mask(token);
    const github = await openGitHub({ repository: run.repository, token, branch: run.branch });
    const released =
      (await cutRelease(await manifestFor(github, run.branch, prereleaseId), run.sha, { warn })) ??
      (await releaseAtCommit({ repository: run.repository, token, sha: run.sha }));
    // After a release this starts the next release PR; otherwise it brings
    // the open one up to date with this push.
    const next = await manifestFor(github, run.branch, prereleaseId);
    await next.createPullRequests();
    if (released) {
      if (versionKind(released.version) !== 'release') {
        throw new Error(
          `release-please released ${released.version}, which Vetra reads as a build: a prerelease must be alpha.N, beta.N or rc.N (vetra.prerelease in powerhouse.config.json)`,
        );
      }
      return { kind: 'release', version: released.version, notes: released.notes };
    }
    return { kind: 'build', version: buildVersion(await proposedVersion(next, prereleaseId), run), notes: null };
  }

  if (!input.githubToken) {
    throw new Error("input 'github-token' is empty: it defaults to the run's own token, which reads the release history");
  }
  const github = await openGitHub({ repository: run.repository, token: input.githubToken, branch: run.target });
  const proposed = await proposedVersion(await manifestFor(github, run.target, prereleaseId), prereleaseId);
  return { kind: 'build', version: buildVersion(proposed, run), notes: null };
}
