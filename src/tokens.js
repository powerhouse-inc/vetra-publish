// Renown workload tokens per audience. They live 10 minutes and an image
// build can take longer: each source re-mints after 5 minutes.

import { exchangeToken } from './exchange.js';
import { requestOidcToken } from './oidc.js';
import { createTokenSource } from './token-source.js';
import { mask } from './util.js';

export const RENOWN_OIDC_AUDIENCE = 'https://renown.vetra.io';

export function renownTokens(renownUrl, audience) {
  return createTokenSource(async () => {
    const oidc = await requestOidcToken(RENOWN_OIDC_AUDIENCE);
    mask(oidc);
    const token = await exchangeToken(renownUrl, oidc, audience);
    mask(token);
    return token;
  });
}
