// The action's inputs, and the state the prepare step hands to the finish
// step (action.yml passes prepare's outputs as VETRA_* variables).

// Vetra verifies one fixed audience whatever vetra-url (staging included) is.
export const VETRA_AUDIENCE = 'https://switchboard.vetra.io/api/@powerhousedao/vetra-cloud-package/apps';

export function actionInputs(env = process.env) {
  const appId = env.INPUT_APP_ID;
  if (!appId) throw new Error("input 'app-id' is required");
  return {
    appId,
    vetraUrl: env.INPUT_VETRA_URL || 'https://switchboard.vetra.io',
    vetraAudience: env.INPUT_VETRA_AUDIENCE || VETRA_AUDIENCE,
    renownUrl: env.INPUT_RENOWN_URL || 'https://switchboard.renown.vetra.io',
    githubToken: env.INPUT_GITHUB_TOKEN || '',
  };
}

export function stepState(env = process.env) {
  const need = (k) => {
    const v = env[k];
    if (!v) throw new Error(`${k} is missing: the prepare step did not finish`);
    return v;
  };
  return {
    kind: need('VETRA_KIND'),
    version: need('VETRA_VERSION'),
    notes: env.VETRA_NOTES ? env.VETRA_NOTES : null,
    releaseBranch: env.VETRA_RELEASE_BRANCH === 'true',
    production: env.VETRA_PRODUCTION === 'true',
    imageRef: need('VETRA_IMAGE_REF'),
    imageDigest: need('VETRA_IMAGE_DIGEST'),
    powerhouse: need('VETRA_POWERHOUSE'),
    baseImage: need('VETRA_BASE_IMAGE'),
  };
}
