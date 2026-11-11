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

const REPORT_DELAYS_MS = [5_000, 15_000, 30_000];

/**
 * POST ci/releases. Vetra answers SERVICE_UNAVAILABLE when Renown, Harbor or
 * GitHub did not answer: retried with a fresh token (a report is idempotent,
 * 200 for a version it already has with the same digest). Verdicts are not
 * retried.
 */
export async function reportRelease(vetraUrl, getToken, body, opts = {}) {
  const delays = opts.delays ?? REPORT_DELAYS_MS;
  const sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await postJson(`${appsCiBaseUrl(vetraUrl)}/releases`, await getToken(), body, { fetchImpl: opts.fetchImpl });
    } catch (err) {
      const message = String(err?.message ?? err);
      if (message.startsWith('VERSION_CONFLICT:')) {
        throw new Error(
          `${message}. Vetra already has ${body.version} with another image digest, and tags are never moved: publish a new version instead.`,
        );
      }
      if (!message.startsWith('SERVICE_UNAVAILABLE:') || attempt >= delays.length) throw err;
      console.log(`Vetra: ${message}; retrying in ${delays[attempt] / 1000}s.`);
      await sleep(delays[attempt]);
    }
  }
}
