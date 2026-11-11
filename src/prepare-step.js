// Step 1 of vetra-publish: what this run publishes (release or build, the
// version), the release PR on release branches, then the host image. The
// composite attests the image next, then runs finish. Every collaborator is
// injectable (tests); src/prepare.js runs it with the real ones.

import fs from 'node:fs';
import { workloadClaim } from './claim.js';
import { hostDockerfile, readVetraConfig } from './config.js';
import { decideVersion } from './decide.js';
import { baseImageOf } from './dockerfile.js';
import { baseImageDigest, dockerLogin, ociLabels, powerhouseVersion, publishImage } from './image.js';
import { actionInputs } from './inputs.js';
import { publishableDirs } from './packages.js';
import { appsAudience } from './rest.js';
import { runContext } from './run-context.js';
import { renownTokens } from './tokens.js';
import { mask, notice, setOutput, warning } from './util.js';
import { registryToken } from './vetra-api.js';

const REAL = {
  actionInputs,
  runContext,
  cwd: () => process.cwd(),
  readVetraConfig,
  hostDockerfile,
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
  setOutput,
};

export async function prepareStep(overrides = {}) {
  const d = { ...REAL, ...overrides };
  const input = d.actionInputs();
  const run = d.runContext();
  const dir = d.cwd();
  const config = d.readVetraConfig(dir);
  const dockerfile = d.hostDockerfile(dir, config);

  const appsToken = d.renownTokens(input.renownUrl, appsAudience(input.vetraUrl));
  const claim = d.workloadClaim(await appsToken());
  const releaseBranch = run.event === 'push' && claim.releaseBranch === true;
  const { kind, version, notes } = await d.decideVersion({ run, claim, config, appsToken, input });
  d.notice(`Vetra: ${kind} ${version}`);

  const reg = await d.registryToken(input.vetraUrl, await appsToken(), input.appId);
  d.mask(reg.password);
  d.dockerLogin(reg);
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
  const publish = d.publishableDirs(config.packageDirs, d.warning).length > 0;

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
  };
  for (const [k, v] of Object.entries(outputs)) d.setOutput(k, v);
  return outputs;
}
