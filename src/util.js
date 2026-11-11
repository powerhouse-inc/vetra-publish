// Small process/IO helpers shared across the action's scripts. Kept thin and
// side-effecting on purpose (logging, env files, subprocess exec) — the pure
// decision logic lives in ref.js / version.js / rest.js / image.js.

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

/**
 * Runs a command synchronously and returns stdout. Throws (with stderr
 * attached) on a non-zero exit code. Never logs the resolved command's
 * environment, so callers must mask secrets themselves before/after calling.
 * @param {string} cmd
 * @param {string[]} args
 * @param {import('node:child_process').SpawnSyncOptions} [opts]
 */
export function execCmd(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const stderr = res.stderr ? `\n${res.stderr}` : '';
    throw new Error(`'${cmd} ${args.join(' ')}' failed with exit code ${res.status}${stderr}`);
  }
  return res.stdout ?? '';
}

/** Masks a secret value in the workflow log. No-op for empty values. */
export function mask(value) {
  if (!value) return;
  for (const line of String(value).split('\n')) {
    if (line) process.stdout.write(`::add-mask::${line}\n`);
  }
}

export function notice(message) {
  process.stdout.write(`::notice::${message}\n`);
}

export function warning(message) {
  process.stdout.write(`::warning::${message}\n`);
}

/** An error annotation that does not fail the step. */
export function errorAnnotation(message) {
  process.stdout.write(`::error::${message}\n`);
}

/** Marks the step as failed without throwing (mirrors @actions/core.setFailed). */
export function setFailed(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exitCode = 1;
}

/**
 * Writes a `name=value` output in the multiline GITHUB_OUTPUT format. The
 * delimiter is random per call (values such as release notes come from
 * contributors' commit and PR titles): a value containing it is refused, so it
 * can never end the value early and forge another output.
 */
export function setOutput(name, value, { uuid = randomUUID } = {}) {
  const file = process.env.GITHUB_OUTPUT;
  const text = String(value ?? '');
  if (file) {
    const delimiter = `ghadelimiter_${uuid()}`;
    if (name.includes(delimiter) || text.includes(delimiter)) {
      throw new Error(`output '${name}' contains its delimiter ${delimiter}: not writing it`);
    }
    fs.appendFileSync(file, `${name}<<${delimiter}\n${text}\n${delimiter}\n`);
  } else {
    // Fallback for local/manual runs without a GITHUB_OUTPUT file.
    process.stdout.write(`[output] ${name}=${text}\n`);
  }
}

/** Appends markdown to the job summary, if GITHUB_STEP_SUMMARY is set. */
export function appendSummary(markdown) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) fs.appendFileSync(file, markdown);
}
