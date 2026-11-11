# vetra-publish

Publishes every build and release of a [Vetra](https://vetra.io) App from GitHub Actions:

1. **Version.** A push to a release branch (your App's production branch, or one listed in its
   release branches in Vetra) keeps a release PR open with the next version and changelog
   (release-please, from conventional commits). Merging it tags `v<version>`, creates the GitHub
   release, and this run publishes that release. Every other push and same-repo PR publishes a
   build: `<proposed>-<branch>.<run>` or `<proposed>-pr.<n>.<run>`.
2. **Host image.** Builds `hosts/<host>/Dockerfile` (default `cli`) once and pushes
   `cr.vetra.io/<namespace>/<app>:<version>`. Tags are never moved.
3. **Attestation.** `actions/attest-build-provenance` signs the image with this run's identity.
4. **Packages.** Publishes each package in `vetra.packageDirs` at the same version: builds to
   `registry.dev.vetra.io` (or `registry.vetra.io` on release branches) under the branch or
   `pr-<n>` dist-tag, releases to `registry.vetra.io` under `latest` (`latest-<major>` from a
   maintenance branch) or `next` (prereleases).
5. **Report.** Records the build or release in Vetra (`POST ci/releases`). It deploys nothing.

No secrets: every credential is minted per run from the run's GitHub OIDC token, through Renown.
Release PRs and tags are made as the Vetra GitHub App, so they start workflows.

## Workflow

Vetra generates `.github/workflows/vetra.yml` for you (the setup pull request). The file must be
named `vetra.yml`: Vetra accepts only images attested by it.

```yaml
name: Vetra
on:
  push:
    branches: ['**', '!release-please--**']
  pull_request:
    types: [opened, synchronize, reopened]
permissions: {}
concurrency:
  group: vetra-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  publish:
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      pull-requests: read
      attestations: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - uses: powerhouse-inc/vetra-publish@v1
        with:
          app-id: <APP_ID>
```

## Inputs

| Input | Default | |
|---|---|---|
| `app-id` | required | The Vetra App id. |
| `vetra-url` | `https://switchboard.vetra.io` | |
| `renown-url` | `https://switchboard.renown.vetra.io` | |
| `install-command` | `pnpm install --frozen-lockfile` | Runs only when there is a package to publish. |
| `build-command` | `pnpm build` | Runs only when there is a package to publish. |
| `github-token` | `${{ github.token }}` | Reads release history for builds. |

Outputs: `kind` (`release` or `build`), `version`, `image` (`<ref>@<digest>`).

## GitHub App permissions

Release PRs and tags are made by the Vetra GitHub App, installed on the repository with:
`contents: write`, `pull_requests: write`, `attestations: read`. When the App's permissions
change, each installation must approve the new permissions before releases work again.

## Release branches

An App's production branch always publishes releases. Other branches publish releases only when
listed in the App's settings in Vetra (App > Settings > Release branches): exact names (`next`,
`1.x`) or `*` matching within one path segment (`release/*`). Only listed branches publish
releases, and only they publish packages to `registry.vetra.io`; all other branches publish builds.

## `powerhouse.config.json`

All optional, in the `vetra` section next to `ph vetra`'s own keys:

```json
{
  "vetra": {
    "host": "cli",
    "packageDirs": ["."],
    "prerelease": { "next": "beta" },
    "requires": { "powerhouse": ">=6.2.3", "services": ["DOCLING"], "size": "M" },
    "migrations": ["processors/*/migrations.ts", "processors/*/migrations/**", "document-models/*/upgrades/**"],
    "migrates": false
  }
}
```

- `prerelease`: release branches that publish prereleases, and their identifier (`alpha`, `beta`,
  `rc`): `next` proposes `2.0.0-beta.0`, `beta.1`…
- `migrations`: a release whose commits since the previous release touch these files is marked
  as migrating (rollouts then back up and rehearse). `migrates: true` forces it for the next release.

Check it before pushing: `npx -y github:powerhouse-inc/vetra-publish#v1 check`.

## Releases

- PR titles must be conventional commits (`feat: …`, `fix: …`, `feat!: …`): squash merges make
  them the commit release-please reads.
- Finishing a prerelease line: bring `next` into `main` with a conventional commit such as
  `feat!: 2.0`, or a commit with the footer `Release-As: 2.0.0`.
- Changing a branch's prerelease identifier (`beta` → `rc`): change `vetra.prerelease` and push a
  commit with `Release-As: 2.0.0-rc.0`.
- Maintenance branches (`1.x`, `2.x`) ship patches only (always bump the patch) and are never marked
  as GitHub's "Latest" release.
- The workflow's `actions/checkout` needs `fetch-depth: 0`: the migrations check refuses a shallow clone.
- A failed release run can be re-run: the tag and image already exist and are reused.
