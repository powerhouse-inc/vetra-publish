// `vetra-publish check` (releases spec 14.10): validates powerhouse.config.json's
// vetra section and the host, and prints the version the next release from a
// branch would get (from the branch as pushed to GitHub). Run in a project:
//   npx -y github:powerhouse-inc/vetra-publish#v1 check [--branch <name>]
// GITHUB_TOKEN, GH_TOKEN or a logged-in `gh` reads the release history.

import { hostDockerfile, readVetraConfig } from './config.js';
import { manifestFor, openGitHub, proposedVersion } from './release-please.js';
import { parseRemote } from './run-context.js';
import { execCmd } from './util.js';

const tryExec = (cmd, args) => {
  try {
    return execCmd(cmd, args).trim();
  } catch {
    return '';
  }
};

async function main(argv) {
  const [command, ...rest] = argv;
  if (command !== 'check') {
    console.error('usage: vetra-publish check [--branch <name>]');
    process.exitCode = 2;
    return;
  }
  const dir = process.cwd();
  const config = readVetraConfig(dir);
  const dockerfile = hostDockerfile(dir, config);
  console.log(`ok   powerhouse.config.json: host ${config.host} (${dockerfile}), packages ${config.packageDirs.join(', ') || 'none'}`);

  const i = rest.indexOf('--branch');
  const branch = i >= 0 ? rest[i + 1] : tryExec('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  const repository = parseRemote(tryExec('git', ['remote', 'get-url', 'origin']));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || tryExec('gh', ['auth', 'token']);
  if (!branch || !repository || !token) {
    console.log('--   next release: unknown (needs a GitHub origin, a branch, and GITHUB_TOKEN, GH_TOKEN or `gh auth login`)');
    return;
  }
  const prereleaseId = config.prerelease[branch] ?? null;
  const github = await openGitHub({ repository, token, branch });
  const version = await proposedVersion(await manifestFor(github, branch, prereleaseId), prereleaseId);
  console.log(`ok   next release from ${branch}: ${version} (published only if ${branch} is the production branch or a release branch of the app in Vetra)`);
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`fail ${err?.message ?? err}`);
  process.exitCode = 1;
});
