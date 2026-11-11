// Step 2 of vetra-publish, after the attestation: npm packages at the run's
// version, then POST ci/releases. Deploys nothing. Every collaborator is
// injectable (tests); src/finish.js runs it with the real ones.

import { readVetraConfig } from './config.js';
import { actionInputs, stepState } from './inputs.js';
import { computeMigrates } from './migrates.js';
import { distTagFor, publishPackages, publishableDirs, registryFor } from './packages.js';
import { releaseBody, summaryMarkdown } from './report.js';
import { appsAudience } from './rest.js';
import { runContext } from './run-context.js';
import { renownTokens } from './tokens.js';
import { appendSummary, setOutput, warning } from './util.js';
import { reportRelease } from './vetra-api.js';

const REAL = {
  actionInputs,
  runContext,
  cwd: () => process.cwd(),
  readVetraConfig,
  stepState,
  publishableDirs,
  renownTokens,
  publishPackages,
  computeMigrates,
  reportRelease,
  appendSummary,
  warning,
  setOutput,
};

export async function finishStep(overrides = {}) {
  const d = { ...REAL, ...overrides };
  const input = d.actionInputs();
  const run = d.runContext();
  const config = d.readVetraConfig(d.cwd());
  const s = d.stepState();

  let packages = [];
  const dirs = d.publishableDirs(config.packageDirs, d.warning);
  if (dirs.length) {
    const registryUrl = registryFor({ releaseBranch: s.releaseBranch, event: run.event });
    const token = await d.renownTokens(input.renownUrl, registryUrl)();
    const distTag = distTagFor({ kind: s.kind, version: s.version, branch: run.branch, pr: run.pr, production: s.production });
    packages = d.publishPackages({ dirs, version: s.version, registryUrl, distTag, token });
  }

  const body = releaseBody({
    appId: input.appId,
    version: s.version,
    kind: s.kind,
    branch: run.branch,
    pr: run.pr,
    commit: run.sha,
    notes: s.notes,
    image: { ref: s.imageRef, digest: s.imageDigest, host: config.host },
    packages,
    requires: config.requires,
    // Needs the full history (actions/checkout fetch-depth: 0): migrates.js throws on a shallow clone.
    migrates: s.kind === 'release' ? d.computeMigrates({ version: s.version, config }) : false,
    built: { powerhouse: s.powerhouse, baseImage: s.baseImage },
  });
  const recorded = await d.reportRelease(input.vetraUrl, d.renownTokens(input.renownUrl, appsAudience(input.vetraUrl)), body);
  d.appendSummary(summaryMarkdown(recorded));
  const outputs = { kind: s.kind, version: s.version, image: `${s.imageRef}@${s.imageDigest}` };
  for (const [k, v] of Object.entries(outputs)) d.setOutput(k, v);
  return outputs;
}
