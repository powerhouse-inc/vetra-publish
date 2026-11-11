import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareStep } from '../src/prepare-step.js';
import { finishStep } from '../src/finish-step.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const BASE = `node:24@sha256:${'b'.repeat(64)}`;
const input = { appId: 'app-1', vetraUrl: 'https://v', renownUrl: 'https://r', githubToken: 'ghs_run' };
const push = (branch) => ({ event: 'push', branch, pr: null, target: branch, sha: 'c0ffee', repository: 'acme/shop', runNumber: '37' });
const pr = { event: 'pull_request', branch: null, pr: 12, target: 'main', sha: 'c0ffee', repository: 'acme/shop', runNumber: '37' };
const config = { host: 'switchboard', packageDirs: ['.'], requires: { powerhouse: '>=6' }, prerelease: {}, migrations: [], migrates: false };

function prepareDeps({ run = push('main'), claim = { production: true, releaseBranch: true }, decided, dirs = [{ dir: '.', name: '@acme/shop' }], published } = {}) {
  const seen = { outputs: {}, notices: [], warnings: [], summary: [], masked: [], logins: [], images: [], audiences: [] };
  const deps = {
    actionInputs: () => input,
    runContext: () => run,
    cwd: () => '/work',
    readVetraConfig: () => config,
    findHostDockerfile: () => 'hosts/switchboard/Dockerfile',
    readFile: () => 'ARG PH_HOST\nFROM node:24\n',
    renownTokens: (url, audience) => (seen.audiences.push([url, audience]), async () => 'renown-apps'),
    workloadClaim: () => claim,
    decideVersion: async (args) => ((seen.decideArgs = args), decided ?? { kind: 'release', version: '1.5.0', notes: '## Features' }),
    registryToken: async (url, token, appId) => ((seen.reg = [url, token, appId]), { registry: 'cr.vetra.io', repository: 'acme/shop', username: 'robot', password: 'pw' }),
    mask: (v) => seen.masked.push(v),
    dockerLogin: (reg) => seen.logins.push(reg),
    publishImage: (args) => (seen.images.push(args), published ?? { name: 'cr.vetra.io/acme/shop', ref: `cr.vetra.io/acme/shop:${args.version}`, digest: DIGEST }),
    powerhouseVersion: (ref) => ((seen.phRef = ref), '6.0.0'),
    baseImageOf: (text, args) => ((seen.baseArgs = args), 'node:24'),
    baseImageDigest: (image) => ((seen.baseImage = image), BASE),
    publishableDirs: () => dirs,
    notice: (m) => seen.notices.push(m),
    warning: (m) => seen.warnings.push(m),
    appendSummary: (md) => seen.summary.push(md),
    setOutput: (k, v) => (seen.outputs[k] = v),
  };
  return { deps, seen };
}

test('prepare: without hosts/<host>/Dockerfile it warns and skips the rest: no version, no image, no report', async () => {
  const { deps, seen } = prepareDeps();
  deps.findHostDockerfile = () => null;
  deps.decideVersion = async () => assert.fail('decideVersion must not run');
  const r = await prepareStep(deps);
  assert.deepEqual(seen.outputs, { skipped: 'true', publish: 'false' });
  assert.deepEqual(r, { skipped: 'true', publish: 'false' });
  assert.equal(seen.warnings.length, 1);
  assert.match(seen.warnings[0], /hosts\/switchboard\/Dockerfile is missing/);
  assert.match(seen.summary.join(''), /no host image: add hosts\/switchboard\/Dockerfile — see README/);
  assert.deepEqual(seen.audiences, []);
  assert.equal(seen.images.length, 0);
});

test('prepare: with packages to publish, the registry token is minted before anything is versioned', async () => {
  const order = [];
  const { deps, seen } = prepareDeps();
  deps.renownTokens = (url, audience) => (seen.audiences.push([url, audience]), async () => (order.push(audience), 'renown-token'));
  const decide = deps.decideVersion;
  deps.decideVersion = async (args) => (order.push('decide'), decide(args));
  await prepareStep(deps);
  const registry = order.indexOf('https://registry.vetra.io');
  assert.ok(registry >= 0 && registry < order.indexOf('decide'), order.join(' > '));
  // Never handed on: finish mints its own.
  assert.ok(!Object.values(seen.outputs).includes('renown-token'));
});

test('prepare: a Renown refusal of the registry audience fails before a release is cut', async () => {
  const { deps } = prepareDeps({ run: pr, claim: { production: false, releaseBranch: false } });
  deps.renownTokens = (url, audience) => async () => {
    if (audience === 'https://registry.dev.vetra.io') throw new Error('Renown refused audience');
    return 'renown-apps';
  };
  deps.decideVersion = async () => assert.fail('decideVersion must not run');
  await assert.rejects(prepareStep(deps), /Renown refused audience/);
});

test('prepare: no packages, no registry token', async () => {
  const { deps, seen } = prepareDeps({ dirs: [] });
  await prepareStep(deps);
  assert.ok(!seen.audiences.some(([, a]) => a.includes('registry')));
});

test('prepare: a release on the production branch publishes the image and hands every value to finish', async () => {
  const { deps, seen } = prepareDeps();
  await prepareStep(deps);
  assert.deepEqual(seen.outputs, {
    kind: 'release',
    version: '1.5.0',
    notes: '## Features',
    'release-branch': 'true',
    production: 'true',
    'image-name': 'cr.vetra.io/acme/shop',
    'image-ref': 'cr.vetra.io/acme/shop:1.5.0',
    'image-digest': DIGEST,
    powerhouse: '6.0.0',
    'base-image': BASE,
    publish: 'true',
    skipped: 'false',
    registry: 'cr.vetra.io',
  });
  assert.deepEqual(seen.audiences[0], ['https://r', 'https://v/api/@powerhousedao/vetra-cloud-package/apps']);
  assert.deepEqual(seen.reg, ['https://v', 'renown-apps', 'app-1']);
  assert.ok(seen.masked.includes('pw'));
  assert.equal(seen.logins.length, 1);
  const img = seen.images[0];
  assert.equal(img.registry, 'cr.vetra.io');
  assert.equal(img.repository, 'acme/shop');
  assert.equal(img.dockerfile, 'hosts/switchboard/Dockerfile');
  assert.equal(img.host, 'switchboard');
  assert.equal(img.labels['org.opencontainers.image.revision'], 'c0ffee');
  assert.equal(img.labels['org.opencontainers.image.source'], 'https://github.com/acme/shop');
  assert.equal(seen.phRef, 'cr.vetra.io/acme/shop:1.5.0');
  assert.deepEqual(seen.baseArgs, { PH_HOST: 'switchboard' });
  assert.equal(seen.baseImage, 'node:24');
  assert.deepEqual(seen.notices, ['Vetra: release 1.5.0']);
  assert.equal(seen.decideArgs.input, input);
  assert.equal(await seen.decideArgs.appsToken(), 'renown-apps');
});

test('prepare: a pull request build is never on a release branch; no packages means publish false', async () => {
  const { deps, seen } = prepareDeps({
    run: pr,
    claim: { production: false, releaseBranch: true },
    decided: { kind: 'build', version: '1.5.0-pr-12.37', notes: null },
    dirs: [],
  });
  await prepareStep(deps);
  assert.equal(seen.outputs['release-branch'], 'false');
  assert.equal(seen.outputs.production, 'false');
  assert.equal(seen.outputs.notes, '');
  assert.equal(seen.outputs.kind, 'build');
  assert.equal(seen.outputs.publish, 'false');
});

test('prepare: only the registry (for the logout) is written when the image fails', async () => {
  const { deps, seen } = prepareDeps();
  deps.publishImage = () => {
    throw new Error('push failed');
  };
  await assert.rejects(prepareStep(deps), /push failed/);
  assert.deepEqual(seen.outputs, { registry: 'cr.vetra.io' });
});

const state = (over = {}) => ({
  kind: 'release',
  version: '1.5.0',
  notes: '## Features',
  releaseBranch: true,
  production: true,
  imageRef: 'cr.vetra.io/acme/shop:1.5.0',
  imageDigest: DIGEST,
  powerhouse: '6.0.0',
  baseImage: BASE,
  ...over,
});

function finishDeps({ run = push('main'), s = state(), dirs = [{ dir: '.', name: '@acme/shop' }], migrates = true } = {}) {
  const seen = { outputs: {}, audiences: [], summary: [], published: [] };
  const deps = {
    actionInputs: () => input,
    runContext: () => run,
    cwd: () => '/work',
    readVetraConfig: () => config,
    stepState: () => s,
    publishableDirs: () => dirs,
    renownTokens: (url, audience) => (seen.audiences.push(audience), async () => `token-for:${audience}`),
    publishPackages: (args) => (seen.published.push(args), args.dirs.map((d) => ({ name: d.name, version: args.version }))),
    computeMigrates: (args) => ((seen.migratesArgs = args), migrates),
    reportRelease: async (url, getToken, body) => ((seen.report = { url, token: await getToken(), body }), { ...body, migrates: body.migrates }),
    appendSummary: (md) => seen.summary.push(md),
    warning: () => {},
    setOutput: (k, v) => (seen.outputs[k] = v),
  };
  return { deps, seen };
}

test('finish: a release publishes packages to the production registry as latest and reports them', async () => {
  const { deps, seen } = finishDeps();
  await finishStep(deps);
  const p = seen.published[0];
  assert.equal(p.registryUrl, 'https://registry.vetra.io');
  assert.equal(p.distTag, 'latest');
  assert.equal(p.version, '1.5.0');
  assert.equal(p.token, 'token-for:https://registry.vetra.io');
  assert.deepEqual(seen.migratesArgs, { version: '1.5.0', config });
  const { body, token, url } = seen.report;
  assert.equal(url, 'https://v');
  assert.equal(token, 'token-for:https://v/api/@powerhousedao/vetra-cloud-package/apps');
  assert.deepEqual(body, {
    appId: 'app-1',
    version: '1.5.0',
    kind: 'release',
    branch: 'main',
    pr: null,
    commit: 'c0ffee',
    notes: '## Features',
    image: { ref: 'cr.vetra.io/acme/shop:1.5.0', digest: DIGEST, host: 'switchboard' },
    packages: [{ name: '@acme/shop', version: '1.5.0' }],
    requires: { powerhouse: '>=6' },
    migrates: true,
    built: { powerhouse: '6.0.0', baseImage: BASE },
  });
  assert.equal(seen.summary.length, 1);
  assert.match(seen.summary[0], /Vetra release 1\.5\.0/);
  assert.deepEqual(seen.outputs, { kind: 'release', version: '1.5.0', image: `cr.vetra.io/acme/shop:1.5.0@${DIGEST}` });
});

test('finish: a pull request build goes to the dev registry as pr-<n> and never computes migrates', async () => {
  const { deps, seen } = finishDeps({ run: pr, s: state({ kind: 'build', version: '1.5.0-pr-12.37', notes: null, releaseBranch: false, production: false }) });
  await finishStep(deps);
  assert.equal(seen.published[0].registryUrl, 'https://registry.dev.vetra.io');
  assert.equal(seen.published[0].distTag, 'pr-12');
  assert.equal(seen.migratesArgs, undefined);
  assert.equal(seen.report.body.migrates, false);
  assert.equal(seen.report.body.notes, null);
  assert.equal(seen.report.body.pr, 12);
  assert.equal(seen.report.body.branch, null);
});

test('finish: no publishable package mints no registry token and reports no packages', async () => {
  const { deps, seen } = finishDeps({ dirs: [] });
  await finishStep(deps);
  assert.equal(seen.published.length, 0);
  assert.ok(!seen.audiences.some((a) => a.includes('registry')));
  assert.deepEqual(seen.report.body.packages, []);
});

test('finish: a failed report writes no outputs', async () => {
  const { deps, seen } = finishDeps();
  deps.reportRelease = async () => {
    throw new Error('VERSION_CONFLICT: nope');
  };
  await assert.rejects(finishStep(deps), /VERSION_CONFLICT/);
  assert.deepEqual(seen.outputs, {});
  assert.equal(seen.summary.length, 0);
});
