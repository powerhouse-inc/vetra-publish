// The `vetra` section of powerhouse.config.json, as far as this action reads
// it (releases spec, section 3). Other keys there (connectPort, driveId,
// driveUrl, previewDrive) belong to `ph vetra` and are ignored.

import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'powerhouse.config.json';

/** Reactor and read-model migrations of a Powerhouse project. */
export const DEFAULT_MIGRATIONS = [
  'processors/*/migrations.ts',
  'processors/*/migrations/**',
  'document-models/*/upgrades/**',
];

const HOST = /^[a-z][a-z0-9-]{0,63}$/;
const PRERELEASE_IDS = ['alpha', 'beta', 'rc'];
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const REQUIRES_KEYS = ['powerhouse', 'services', 'size'];

const isPlainObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isStringList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string' && s.trim() !== '');

export function parseVetraConfig(vetra) {
  const out = {
    host: 'cli',
    packageDirs: ['.'],
    prerelease: {},
    requires: {},
    migrations: [...DEFAULT_MIGRATIONS],
    migrates: false,
  };
  if (vetra === undefined || vetra === null) return out;
  if (!isPlainObject(vetra)) throw new Error(`${CONFIG_FILE}: vetra must be an object`);
  const problems = [];
  const v = vetra;

  if (v.host !== undefined) {
    if (typeof v.host === 'string' && HOST.test(v.host)) out.host = v.host;
    else problems.push('vetra.host must be a lower-case host name such as "cli"');
  }
  if (v.packageDirs !== undefined) {
    if (isStringList(v.packageDirs)) out.packageDirs = [...v.packageDirs];
    else problems.push('vetra.packageDirs must be a list of directories ([] publishes no package)');
  }
  if (v.prerelease !== undefined) {
    if (!isPlainObject(v.prerelease)) {
      problems.push('vetra.prerelease must map branch names to alpha, beta or rc');
    } else {
      for (const [branch, id] of Object.entries(v.prerelease)) {
        if (PRERELEASE_IDS.includes(id)) out.prerelease[branch] = id;
        else problems.push(`vetra.prerelease.${branch} must be alpha, beta or rc (got ${JSON.stringify(id)})`);
      }
    }
  }
  if (v.requires !== undefined) {
    if (!isPlainObject(v.requires)) {
      problems.push('vetra.requires must be an object');
    } else {
      const r = v.requires;
      for (const k of Object.keys(r)) {
        if (!REQUIRES_KEYS.includes(k)) problems.push(`vetra.requires.${k} is not known (${REQUIRES_KEYS.join(', ')})`);
      }
      if (r.powerhouse !== undefined) {
        if (typeof r.powerhouse === 'string' && r.powerhouse.trim()) out.requires.powerhouse = r.powerhouse;
        else problems.push('vetra.requires.powerhouse must be a version range such as ">=6.2.3"');
      }
      if (r.services !== undefined) {
        if (isStringList(r.services)) out.requires.services = [...r.services];
        else problems.push('vetra.requires.services must be a list of service names');
      }
      if (r.size !== undefined) {
        if (SIZES.includes(r.size)) out.requires.size = r.size;
        else problems.push(`vetra.requires.size must be one of ${SIZES.join(', ')}`);
      }
    }
  }
  if (v.migrations !== undefined) {
    if (isStringList(v.migrations)) out.migrations = [...v.migrations];
    else problems.push('vetra.migrations must be a list of globs');
  }
  if (v.migrates !== undefined) {
    if (typeof v.migrates === 'boolean') out.migrates = v.migrates;
    else problems.push('vetra.migrates must be true or false');
  }
  if (problems.length) throw new Error(`${CONFIG_FILE}:\n- ${problems.join('\n- ')}`);
  return out;
}

export function readVetraConfig(dir) {
  const file = path.join(dir, CONFIG_FILE);
  if (!fs.existsSync(file)) return parseVetraConfig(undefined);
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${CONFIG_FILE} is not valid JSON: ${err.message}`);
  }
  return parseVetraConfig(json?.vetra);
}

/** The host's Dockerfile relative to `dir`, or null when the project has none. */
export function findHostDockerfile(dir, config) {
  const rel = `hosts/${config.host}/Dockerfile`;
  return fs.existsSync(path.join(dir, rel)) ? rel : null;
}

/** Publishing needs a host (spec 14.11): its Dockerfile, relative to `dir`. */
export function hostDockerfile(dir, config) {
  const rel = findHostDockerfile(dir, config);
  if (rel === null) {
    const want = `hosts/${config.host}/Dockerfile`;
    throw new Error(
      `Publishing needs a host: ${want} is missing. Generate it with \`ph generate hosts\` ` +
        '(a Powerhouse version with uniform runners, FEATURE_UNIFORM_RUNNERS_ENABLED=1).',
    );
  }
  return rel;
}
