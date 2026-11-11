// The `vetra` claim of a Renown workload token, read WITHOUT verification:
// only to decide what to try. Vetra verifies the token and re-checks every
// rule (releases/claim.ts).

export function workloadClaim(token) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Renown returned a token that is not a JWT');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Renown returned a token with an unreadable payload');
  }
  const v = payload?.vetra;
  if (!v || typeof v !== 'object') throw new Error('Renown returned a token without a vetra claim');
  const refClass = typeof v.refClass === 'string' ? v.refClass : null;
  return {
    refClass,
    production: refClass === 'PRODUCTION',
    // A Renown from before release branches sets no flag, but mints push
    // tokens only for the production branch (Vetra reads it the same way).
    releaseBranch: typeof v.releaseBranch === 'boolean' ? v.releaseBranch : refClass === 'PRODUCTION',
  };
}
