// Step 1 of vetra-publish: what this run publishes (release or build, the
// version), the release PR on release branches, then the host image. The
// composite attests the image next, then runs finish. Every collaborator is
// injectable (tests); src/prepare.js runs it with the real ones.

import fs from 'node:fs';
import { workloadClaim } from './claim.js';
import { findHostDockerfile, readVetraConfig } from './config.js';
import { decideVersion } from './decide.js';
import { baseImageOf } from './dockerfile.js';
import { baseImageDigest, dockerLogin, ociLabels, powerhouseVersion, publishImage } from './image.js';
import { actionInputs } from './inputs.js';
import { publishableDirs, registryFor } from './packages.js';
import { runContext } from './run-context.js';
import { renownTokens } from './tokens.js';
import { appendSummary, mask, notice, setOutput, warning } from './util.js';
import { registryToken } from './vetra-api.js';

const REAL = {
  actionInputs,
  runContext,
  cwd: () => process.cwd(),
  readVetraConfig,
  findHostDockerfile,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  renownTokens,
  workloadClaim,
  decideVersion,
  registryToken,
  mask,
  dockerLogin,
  publishImage,
  powerhouseVersion,
  baseImageOf,
  baseImageDigest,
  publishableDirs,
  notice,
  warning,
  appendSummary,
  setOutput,
};

export async function prepareStep(overrides = {}) {
  const d = { ...REAL, ...overrides };
  const input = d.actionInputs();
  const run = d.runContext();
  const dir = d.cwd();
  const config = d.readVetraConfig(dir);
  const dockerfile = d.findHostDockerfile(dir, config);
  if (dockerfile === null) {
    // Phase 1: a project without a host yet must not fail every push. Nothing
    // is versioned, built, attested or reported; the composite skips the rest.
    const rel = `hosts/${config.host}/Dockerfile`;
    d.warning(`Vetra: ${rel} is missing, so there is no host image to publish: generate it with \`ph generate hosts\`. Nothing was published.`);
    d.appendSummary(`**Vetra:** no host image: add ${rel} — see README\n\n`);
    const outputs = { skipped: 'true', publish: 'false' };
    for (const [k, v] of Object.entries(outputs)) d.setOutput(k, v);
    return outputs;
  }

  const appsToken = d.renownTokens(input.renownUrl, input.vetraAudience);
  const claim = d.workloadClaim(await appsToken());
  const releaseBranch = run.event === 'push' && claim.releaseBranch === true;
  const publish = d.publishableDirs(config.packageDirs, d.warning).length > 0;
  if (publish) {
    // Fail before a tag or GitHub release is cut if Renown refuses the npm
    // registry audience. The token is not handed on: finish mints its own.
    await d.renownTokens(input.renownUrl, registryFor({ releaseBranch, event: run.event }))();
  }
  const { kind, version, notes } = await d.decideVersion({ run, claim, config, appsToken, input });
  d.notice(`Vetra: ${kind} ${version}`);

  const reg = await d.registryToken(input.vetraUrl, await appsToken(), input.appId);
  d.mask(reg.password);
  d.dockerLogin(reg);
  // Written at once: the composite's logout step needs it even when a later step fails.
  d.setOutput('registry', reg.registry);
  const image = d.publishImage({
    registry: reg.registry,
    repository: reg.repository,
    version,
    host: config.host,
    dockerfile,
    labels: ociLabels({ version, commit: run.sha, repository: run.repository, host: config.host }),
  });
  const powerhouse = d.powerhouseVersion(image.ref);
  const baseImage = d.baseImageDigest(d.baseImageOf(d.readFile(dockerfile), { PH_HOST: config.host }));

  const outputs = {
    kind,
    version,
    notes: notes ?? '',
    'release-branch': String(releaseBranch),
    production: String(claim.production === true),
    'image-name': image.name,
    'image-ref': image.ref,
    'image-digest': image.digest,
    powerhouse,
    'base-image': baseImage,
    publish: String(publish),
    skipped: 'false',
  };
  for (const [k, v] of Object.entries(outputs)) d.setOutput(k, v);
  return { ...outputs, registry: reg.registry };
}
