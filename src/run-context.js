// What this run is, from the GitHub Actions environment. Vetra accepts
// reports only from `push` (branch refs) and `pull_request` runs, and checks
// that commit, ref and event match the workload token.

export function runContext(env = process.env) {
  const sha = env.GITHUB_SHA;
  const repository = env.GITHUB_REPOSITORY;
  const runNumber = env.GITHUB_RUN_NUMBER;
  if (!sha || !repository || !runNumber) {
    throw new Error('not running in GitHub Actions (GITHUB_SHA, GITHUB_REPOSITORY or GITHUB_RUN_NUMBER missing)');
  }
  const event = env.GITHUB_EVENT_NAME;
  const ref = env.GITHUB_REF ?? '';
  if (event === 'push') {
    const m = /^refs\/heads\/(.+)$/.exec(ref);
    if (!m) throw new Error(`vetra-publish runs on branch pushes, not on ${ref}: remove the tag trigger from vetra.yml`);
    return { event, branch: m[1], pr: null, target: m[1], sha, repository, runNumber };
  }
  if (event === 'pull_request') {
    const m = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
    if (!m || !env.GITHUB_BASE_REF) throw new Error(`unexpected pull request ref ${ref}`);
    return { event, branch: null, pr: Number(m[1]), target: env.GITHUB_BASE_REF, sha, repository, runNumber };
  }
  throw new Error(`vetra-publish runs on push and pull_request, not ${event}: Vetra records only those`);
}

/** `owner/name` of a GitHub remote URL, or null. */
export function parseRemote(url) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\s*$/.exec(String(url));
  return m ? `${m[1]}/${m[2]}` : null;
}
