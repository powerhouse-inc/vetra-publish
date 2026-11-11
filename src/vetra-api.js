// The vetra-apps CI routes this action calls (vetra-cloud-package
// subgraphs/vetra-apps/ci.ts), each with a Renown token for the Vetra
// audience.

import { appsCiBaseUrl, postJson } from './rest.js';

/** POST ci/registry-token: push rights for the app's image repository (a 1-hour robot). */
export function registryToken(vetraUrl, token, appId, opts = {}) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/registry-token`, token, { appId }, opts);
}

/** POST ci/github-token: the Vetra GitHub App's token, for a push to a release branch only (spec 14.1). */
export function githubToken(vetraUrl, token, appId, opts = {}) {
  return postJson(`${appsCiBaseUrl(vetraUrl)}/github-token`, token, { appId }, opts);
}
