import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseImageOf } from '../src/dockerfile.js';

// Shape of a generated hosts/cli/Dockerfile (Sektar's, abridged).
const HOST = `# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

FROM node:\${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION=12.10.1
RUN npm install -g pnpm@\${PNPM_VERSION} \\
 && npm cache clean --force

FROM base AS build
RUN echo build

FROM base AS runtime
COPY --from=build /app /app
`;

test('the final stage, through stage aliases, with global ARG defaults', () => {
  assert.equal(baseImageOf(HOST), 'node:24-bookworm-slim');
});

test('build args override ARG defaults; ${VAR:-x} and --platform are understood', () => {
  assert.equal(baseImageOf(HOST, { NODE_VERSION: '22' }), 'node:22-bookworm-slim');
  assert.equal(baseImageOf('ARG V\nFROM --platform=linux/amd64 alpine:${V:-3.20}\n'), 'alpine:3.20');
});

test('a Dockerfile without FROM is an error', () => {
  assert.throws(() => baseImageOf('# nothing\n'), /no FROM/);
});
