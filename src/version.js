// Version rules of the releases spec (section 3), the same as Vetra's
// subgraphs/vetra-apps/releases/version.ts in vetra-cloud-package: keep the
// two in step. Every version is semver (no build metadata, no leading
// zeros); a release has no prerelease part or exactly alpha|beta|rc.<n>;
// anything else is a build.

const NUM = '(0|[1-9]\\d*)';
const IDENT = '(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)';
const SEMVER = new RegExp(`^${NUM}\\.${NUM}\\.${NUM}(?:-(${IDENT}(?:\\.${IDENT})*))?$`);
const RELEASE_PRE = /^(alpha|beta|rc)\.\d+$/;
const MAX_IDENT = 40;

export function parseVersion(v) {
  const m = SEMVER.exec(String(v));
  if (!m) return null;
  const prerelease = m[4] ? m[4].split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p)) : [];
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), prerelease };
}

export function versionKind(v) {
  const m = SEMVER.exec(String(v));
  if (!m) return null;
  return !m[4] || RELEASE_PRE.test(m[4]) ? 'release' : 'build';
}

function compareIdent(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semver order of two releases; throws when either is a build. */
export function compareReleases(a, b) {
  if (versionKind(a) !== 'release' || versionKind(b) !== 'release') {
    throw new Error(`compareReleases: ${a} or ${b} is a build, not a release`);
  }
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (const k of ['major', 'minor', 'patch']) {
    if (x[k] !== y[k]) return x[k] - y[k];
  }
  if (!x.prerelease.length || !y.prerelease.length) return y.prerelease.length - x.prerelease.length;
  for (let i = 0; i < Math.max(x.prerelease.length, y.prerelease.length); i++) {
    if (x.prerelease[i] === undefined) return -1;
    if (y.prerelease[i] === undefined) return 1;
    const c = compareIdent(x.prerelease[i], y.prerelease[i]);
    if (c !== 0) return c;
  }
  return 0;
}

/**
 * A branch name as one semver prerelease identifier: only [0-9A-Za-z-], at
 * most 40 characters, never purely numeric, never alpha/beta/rc (which would
 * turn `1.4.0-rc.5` into a release).
 */
export function branchIdent(branch) {
  let id = String(branch ?? '')
    .replace(/[^0-9A-Za-z-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_IDENT)
    .replace(/-$/, '');
  if (!id) id = 'branch';
  if (/^\d+$/.test(id)) id = `b${id}`;
  if (id === 'alpha' || id === 'beta' || id === 'rc') id = `branch-${id}`;
  return id.slice(0, MAX_IDENT);
}

/** The version of a build: `<proposed>-<branch>.<run>` (push) or `<proposed>-pr.<n>.<run>`. */
export function buildVersion(proposed, { branch, pr, runNumber }) {
  if (!parseVersion(proposed)) throw new Error(`proposed version ${proposed} is not semver`);
  const run = String(runNumber);
  if (!/^[1-9]\d*$/.test(run)) throw new Error(`run number ${run} is not a positive integer`);
  const middle = pr != null ? `pr.${pr}` : branchIdent(branch);
  const v = `${proposed}-${middle}.${run}`;
  if (versionKind(v) !== 'build') throw new Error(`${v} is not a build version`);
  return v;
}

/**
 * What a branch proposes when release-please has nothing to release: one
 * step after its latest release (the next prerelease number, or the next
 * patch), or 0.1.0 for a project without releases.
 */
export function nextAfter(latest, prereleaseId) {
  const p = latest ? parseVersion(latest) : null;
  if (!p) return prereleaseId ? `0.1.0-${prereleaseId}.0` : '0.1.0';
  const core = `${p.major}.${p.minor}.${p.patch}`;
  const [id, n] = p.prerelease;
  if (p.prerelease.length === 2 && RELEASE_PRE.test(`${id}.${n}`)) {
    return prereleaseId ? `${core}-${id}.${n + 1}` : core;
  }
  const patch = `${p.major}.${p.minor}.${p.patch + 1}`;
  return prereleaseId ? `${patch}-${prereleaseId}.0` : patch;
}
