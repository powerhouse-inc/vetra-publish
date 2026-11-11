import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionInputs, stepState } from '../src/inputs.js';

test('actionInputs: app-id required, URLs default', () => {
  assert.throws(() => actionInputs({}), /app-id/);
  assert.deepEqual(actionInputs({ INPUT_APP_ID: 'app-1', INPUT_GITHUB_TOKEN: 'ghs' }), {
    appId: 'app-1',
    vetraUrl: 'https://switchboard.vetra.io',
    renownUrl: 'https://switchboard.renown.vetra.io',
    githubToken: 'ghs',
  });
});

test('stepState reads what prepare handed over', () => {
  const env = {
    VETRA_KIND: 'release', VETRA_VERSION: '1.5.0', VETRA_NOTES: '## Features', VETRA_RELEASE_BRANCH: 'true',
    VETRA_PRODUCTION: 'false', VETRA_IMAGE_REF: 'cr.vetra.io/acme/shop:1.5.0', VETRA_IMAGE_DIGEST: 'sha256:aa',
    VETRA_POWERHOUSE: '6.2.3', VETRA_BASE_IMAGE: 'node:24@sha256:bb',
  };
  assert.deepEqual(stepState(env), {
    kind: 'release', version: '1.5.0', notes: '## Features', releaseBranch: true, production: false,
    imageRef: 'cr.vetra.io/acme/shop:1.5.0', imageDigest: 'sha256:aa', powerhouse: '6.2.3', baseImage: 'node:24@sha256:bb',
  });
  assert.equal(stepState({ ...env, VETRA_NOTES: '' }).notes, null);
  assert.throws(() => stepState({ ...env, VETRA_VERSION: '' }), /VETRA_VERSION/);
});
