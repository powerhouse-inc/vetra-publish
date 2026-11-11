// `migrates` of a release (releases spec, section 3): the commits since the
// previous release add or change files matching vetra.migrations, or the
// config says vetra.migrates: true. Needs the full history (fetch-depth: 0).

import { execCmd } from './util.js';
import { compareReleases, parseVersion, versionKind } from './version.js';

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function touchesMigrations(files, globs) {
  const res = globs.map(globToRegExp);
  return files.some((f) => res.some((r) => r.test(f)));
}

/**
 * The release `version` migrates from: the highest earlier release tag in
 * HEAD^'s history, counting only full releases for a full release (2.0.0
 * migrates from 1.4.0, not from 2.0.0-beta.3).
 */
export function previousRelease(version, exec = execCmd) {
  const full = parseVersion(version).prerelease.length === 0;
  let tags;
  try {
    tags = exec('git', ['tag', '--merged', 'HEAD^', '--list', 'v*']).split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
  const earlier = tags
    .map((t) => t.slice(1))
    .filter((v) => versionKind(v) === 'release')
    .filter((v) => !full || parseVersion(v).prerelease.length === 0)
    .filter((v) => compareReleases(v, version) < 0)
    .sort(compareReleases);
  return earlier.length ? `v${earlier.at(-1)}` : null;
}

export function computeMigrates({ version, config }, exec = execCmd) {
  if (config.migrates) return true;
  const prev = previousRelease(version, exec);
  if (!prev) return false;
  const files = exec('git', ['diff', '--name-only', `${prev}..HEAD`]).split('\n').filter(Boolean);
  return touchesMigrations(files, config.migrations);
}
