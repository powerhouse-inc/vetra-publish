// The app's host image: cr.vetra.io/<namespace>/<app>:<version>, built once
// from hosts/<host>/Dockerfile with the project root as context. Tags are
// written once: a re-run finds the tag and reuses its digest.

import { execCmd } from './util.js';

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function dockerLogin({ registry, username, password }, exec = execCmd) {
  exec('docker', ['login', registry, '-u', username, '--password-stdin'], { input: password });
}

/** The digest of `ref` in the registry, or null when the tag does not exist. */
export function remoteDigest(ref, exec = execCmd) {
  try {
    const out = exec('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}']);
    const digest = JSON.parse(out).digest;
    return DIGEST.test(digest ?? '') ? digest : null;
  } catch {
    return null;
  }
}

export function buildAndPush({ ref, dockerfile, host, labels, context = '.' }, exec = execCmd) {
  const labelArgs = Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]);
  exec('docker', ['build', '-f', dockerfile, '--build-arg', `PH_HOST=${host}`, ...labelArgs, '-t', ref, context], { stdio: 'inherit' });
  exec('docker', ['push', ref], { stdio: 'inherit' });
  const repoDigest = exec('docker', ['inspect', '--format', '{{index .RepoDigests 0}}', ref]).trim();
  const digest = repoDigest.split('@')[1];
  if (!DIGEST.test(digest ?? '')) throw new Error(`docker reported no digest for ${ref} (${repoDigest})`);
  return digest;
}

export function publishImage({ registry, repository, version, host, dockerfile, labels }, exec = execCmd) {
  const name = `${registry}/${repository}`;
  const ref = `${name}:${version}`;
  const existing = remoteDigest(ref, exec);
  if (existing) {
    console.log(`Vetra: ${ref} already exists (${existing}); reusing it.`);
    return { name, ref, digest: existing };
  }
  return { name, ref, digest: buildAndPush({ ref, dockerfile, host, labels }, exec) };
}

/** The Powerhouse version the image was built with: its @powerhousedao/ph-cli. */
export function powerhouseVersion(ref, exec = execCmd) {
  const out = exec('docker', [
    'run', '--rm', '--entrypoint', 'node', ref,
    '-p', "require('/app/node_modules/@powerhousedao/ph-cli/package.json').version",
  ]).trim();
  if (!/^\d+\.\d+\.\d+/.test(out)) {
    throw new Error(`could not read the Powerhouse version from ${ref} (got ${JSON.stringify(out.slice(0, 200))}): the host image must have @powerhousedao/ph-cli under /app`);
  }
  return out;
}

/** `<image>@sha256:…` of the base image (pulled when the build did not pull it). */
export function baseImageDigest(image, exec = execCmd) {
  const inspect = () => exec('docker', ['image', 'inspect', '--format', '{{index .RepoDigests 0}}', image]).trim();
  let out;
  try {
    out = inspect();
  } catch {
    exec('docker', ['pull', '-q', image]);
    out = inspect();
  }
  const digest = out.split('@')[1];
  if (!DIGEST.test(digest ?? '')) throw new Error(`no digest for base image ${image} (${out})`);
  return `${image}@${digest}`;
}

export function ociLabels({ version, commit, repository, host }) {
  return {
    'org.opencontainers.image.version': version,
    'org.opencontainers.image.revision': commit,
    'org.opencontainers.image.source': `https://github.com/${repository}`,
    'io.vetra.host': host,
  };
}
