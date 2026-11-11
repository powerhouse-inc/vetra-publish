// The app's host image: cr.vetra.io/<namespace>/<app>:<version>, built once
// from hosts/<host>/Dockerfile with the project root as context. Tags are
// written once: a re-run finds the tag and reuses its digest.

import { execCmd, mask } from './util.js';

const DIGEST = /^sha256:[a-f0-9]{64}$/;

export function dockerLogin({ registry, username, password }, exec = execCmd) {
  mask(password);
  exec('docker', ['login', registry, '-u', username, '--password-stdin'], { input: password });
}

// What registries answer for a tag that does not exist. buildx/containerd
// reports it as `ERROR: <ref>: not found`; any other "404" (a token endpoint,
// a proxy) is an error, not an absent tag.
const NOT_FOUND = /manifest unknown|MANIFEST_UNKNOWN|not found: manifest|404 Not Found|^ERROR: \S+: not found$/im;

/**
 * The digest the registry serves for `ref`, or null when the tag does not
 * exist. Any other failure (outage, auth) throws: it must never read as
 * "absent", or a rebuild would overwrite an existing tag.
 */
export function remoteDigest(ref, exec = execCmd) {
  let out;
  try {
    out = exec('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}']);
  } catch (e) {
    if (NOT_FOUND.test(String(e?.message ?? e))) return null;
    throw e;
  }
  const digest = JSON.parse(out).digest;
  return DIGEST.test(digest ?? '') ? digest : null;
}

export function buildAndPush({ ref, dockerfile, host, labels, context = '.' }, exec = execCmd) {
  const labelArgs = Object.entries(labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]);
  exec('docker', ['build', '-f', dockerfile, '--build-arg', `PH_HOST=${host}`, ...labelArgs, '-t', ref, context], { stdio: 'inherit' });
  exec('docker', ['push', ref], { stdio: 'inherit' });
  // The digest the registry serves (manifest or index) is what gets attested.
  const digest = remoteDigest(ref, exec);
  if (!digest) throw new Error(`no digest for ${ref} in the registry after pushing it`);
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

/**
 * `<image>@sha256:…` of the base image, as the registry serves it now. On the
 * reuse path (tag already published) this is today's value of the tag, not
 * necessarily what the original build used.
 */
export function baseImageDigest(image, exec = execCmd) {
  if (/@sha256:[a-f0-9]{64}$/.test(image)) return image;
  const digest = remoteDigest(image, exec);
  if (!digest) throw new Error(`no digest for base image ${image} in its registry`);
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
