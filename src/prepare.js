// Entry point of the vetra-publish prepare step (bundled to dist/prepare/index.js).

import { prepareStep } from './prepare-step.js';
import { withUnansweredRetry } from './fetch-retry.js';
import { setFailed } from './util.js';

// A request after a long build can hit a dead keep-alive socket.
globalThis.fetch = withUnansweredRetry(globalThis.fetch);
prepareStep().catch((err) => setFailed(err?.stack || String(err?.message || err)));
