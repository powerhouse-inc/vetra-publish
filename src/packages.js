// npm packages, published at the run's version (releases spec, section 3,
// step 4). package.json versions are stamped locally and never committed;
// pnpm pack resolves workspace:/catalog: ranges.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { extractTarballName } from './publish.js';
import { execCmd } from './util.js';
import { parseVersion } from './version.js';

export const PRODUCTION_REGISTRY = 'https://registry.vetra.io';
export const DEV_REGISTRY = 'https://registry.dev.vetra.io';

/** Renown gives the production registry audience only to pushes on the production and release branches. */
export function registryFor({ releaseBranch, event }) {
  return event === 'push' && releaseBranch ? PRODUCTION_REGISTRY : DEV_REGISTRY;
}

const RESERVED_TAGS = /^(latest|next|latest-\d+)$/;

/**
 * Releases: latest (production branch), latest-<major> (other release
 * branches: a 1.x patch must not move latest back), next (prereleases).
 * Builds: the branch or pr-<n>; a branch that would clash with those tags or
 * parse as a version range (npm refuses `1.x`) gets `branch-` in front.
 */
export function distTagFor({ kind, version, branch, pr, production }) {
  if (kind === 'release') {
    const p = parseVersion(version);
    if (p.prerelease.length) return 'next';
    return production ? 'latest' : `latest-${p.major}`;
  }
  if (pr != null) return `pr-${pr}`;
  const tag = String(branch ?? '').replace(/[^0-9A-Za-z-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'branch';
  return RESERVED_TAGS.test(tag) || /^v?\d/.test(tag) || semver.validRange(tag) !== null ? `branch-${tag}` : tag;
}

export function publishableDirs(dirs, warn) {
  const out = [];
  for (const dir of dirs) {
    const file = path.join(dir, 'package.json');
    if (!fs.existsSync(file)) {
      warn(`Vetra: no package.json in '${dir}': not publishing it.`);
      continue;
    }
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (pkg.private) {
      warn(`Vetra: '${dir}' (${pkg.name ?? 'unnamed'}) is private: not publishing it.`);
      continue;
    }
    if (!pkg.name) {
      warn(`Vetra: '${dir}' has no package name: not publishing it.`);
      continue;
    }
    out.push({ dir, name: pkg.name });
  }
  return out;
}

export function publishPackages({ dirs, version, registryUrl, distTag, token }, exec = execCmd, log = console.log) {
  const registry = registryUrl.replace(/\/+$/, '');
  const published = [];
  for (const { dir, name } of dirs) {
    const pkgFile = path.join(dir, 'package.json');
    const original = fs.readFileSync(pkgFile, 'utf8');
    let tarball = null;
    let scratch = null;
    try {
      // The token file lives outside the package dir so that `pnpm pack` can never ship it.
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-publish-'));
      const npmrc = path.join(scratch, '.npmrc');
      fs.writeFileSync(npmrc, `//${registry.replace(/^https?:\/\//, '')}/:_authToken=${token}\nregistry=${registry}/\n`, { mode: 0o600 });
      let already = '';
      try {
        already = exec('npm', ['view', `${name}@${version}`, 'version', '--registry', registry, '--userconfig', npmrc], { cwd: dir }).trim();
      } catch (e) {
        if (!/E404/.test(String(e?.message ?? e))) throw e; // auth, network, 5xx: not "unpublished"
      }
      if (already === version) {
        log(`Vetra: ${name}@${version} is already in ${registry}; not publishing it again.`);
      } else {
        fs.writeFileSync(pkgFile, `${JSON.stringify({ ...JSON.parse(original), version }, null, 2)}\n`);
        tarball = extractTarballName(exec('pnpm', ['pack'], { cwd: dir }), dir);
        exec('npm', ['publish', tarball, '--registry', registry, '--tag', distTag, '--userconfig', npmrc], { cwd: dir });
      }
      published.push({ name, version });
    } finally {
      fs.writeFileSync(pkgFile, original);
      if (tarball) fs.rmSync(tarball, { force: true });
      if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
  return published;
}
