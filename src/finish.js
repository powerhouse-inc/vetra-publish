// Entry point of the vetra-publish finish step (bundled to dist/finish/index.js).

import { finishStep } from './finish-step.js';
import { withUnansweredRetry } from './fetch-retry.js';
import { setFailed } from './util.js';

// A request after a long build can hit a dead keep-alive socket.
globalThis.fetch = withUnansweredRetry(globalThis.fetch);
finishStep().catch((err) => setFailed(err?.stack || String(err?.message || err)));
