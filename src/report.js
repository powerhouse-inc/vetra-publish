// POST ci/releases: the body exactly as vetra-cloud-package's
// parseReleaseBody (subgraphs/vetra-apps/ci.ts) reads it. Strict on the
// server: never send extra shapes or coerced types.

function pickRequires(requires) {
  const out = {};
  for (const k of ['powerhouse', 'services', 'size']) {
    if (requires?.[k] !== undefined) out[k] = requires[k];
  }
  return out;
}

export function releaseBody(r) {
  const isPr = r.pr != null;
  return {
    appId: r.appId,
    version: r.version,
    kind: r.kind,
    branch: isPr ? null : (r.branch ?? null),
    pr: isPr ? r.pr : null,
    commit: r.commit,
    notes: r.kind === 'release' ? (r.notes ?? '') : null,
    image: { ref: r.image.ref, digest: r.image.digest, host: r.image.host },
    packages: (r.packages ?? []).map(({ name, version }) => ({ name, version })),
    requires: pickRequires(r.requires),
    migrates: r.migrates === true,
    built: { powerhouse: r.built.powerhouse, baseImage: r.built.baseImage },
  };
}

/** Job summary of what Vetra recorded. */
export function summaryMarkdown(r) {
  const packages = r.packages.map((p) => `\`${p.name}@${p.version}\``).join(', ') || 'none';
  return [
    `### Vetra ${r.kind} ${r.version}`,
    '',
    '| | |',
    '|---|---|',
    `| Image | \`${r.image.ref}@${r.image.digest}\` |`,
    `| Commit | \`${r.commit}\` |`,
    `| Packages | ${packages} |`,
    `| Migrates | ${r.migrates ? 'yes' : 'no'} |`,
    '',
  ].join('\n');
}
