import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setOutput, appendSummary } from '../src/util.js';

test('setOutput writes the multiline-safe GITHUB_OUTPUT format', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-output-'));
  const file = path.join(dir, 'output');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput('version', '1.4.0-pr.42.abc1234');
    const contents = fs.readFileSync(file, 'utf8');
    assert.match(contents, /^version<<.+\n1\.4\.0-pr\.42\.abc1234\n.+\n$/);
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('setOutput writes an empty value cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-output-'));
  const file = path.join(dir, 'output');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    setOutput('deployment-id', '');
    const contents = fs.readFileSync(file, 'utf8');
    assert.match(contents, /^deployment-id<<.+\n\n.+\n$/);
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('appendSummary appends to GITHUB_STEP_SUMMARY', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-deploy-action-summary-'));
  const file = path.join(dir, 'summary');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_STEP_SUMMARY;
  process.env.GITHUB_STEP_SUMMARY = file;
  try {
    appendSummary('# hello\n');
    appendSummary('more\n');
    assert.equal(fs.readFileSync(file, 'utf8'), '# hello\nmore\n');
  } finally {
    process.env.GITHUB_STEP_SUMMARY = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** GitHub's runner reading of GITHUB_OUTPUT: `name<<DELIM`, lines, then a line equal to DELIM. */
function parseOutputs(text) {
  const lines = text.split('\n');
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^<=]+)<<(.+)$/.exec(lines[i]);
    if (!m) continue;
    const body = [];
    for (i++; i < lines.length && lines[i] !== m[2]; i++) body.push(lines[i]);
    out[m[1]] = body.join('\n');
  }
  return out;
}

function withOutputFile(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vetra-publish-output-'));
  const file = path.join(dir, 'output');
  fs.writeFileSync(file, '');
  const original = process.env.GITHUB_OUTPUT;
  process.env.GITHUB_OUTPUT = file;
  try {
    fn();
    return fs.readFileSync(file, 'utf8');
  } finally {
    process.env.GITHUB_OUTPUT = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('setOutput: a value with the old fixed delimiter and forged outputs round-trips and overrides nothing', () => {
  const notes = '## Fixes\n__VETRA_DEPLOY_ACTION_EOF__\nimage-digest<<X\nsha256:evil\nX\nkind=build';
  const contents = withOutputFile(() => {
    setOutput('notes', notes);
    setOutput('image-digest', 'sha256:good');
  });
  assert.deepEqual(parseOutputs(contents), { notes, 'image-digest': 'sha256:good' });
  assert.match(contents, /^notes<<ghadelimiter_[0-9a-f-]{36}\n/);
});

test('setOutput uses a fresh delimiter per call', () => {
  const contents = withOutputFile(() => {
    setOutput('a', '1');
    setOutput('b', '2');
  });
  const delims = [...contents.matchAll(/<<(.+)\n/g)].map((m) => m[1]);
  assert.equal(delims.length, 2);
  assert.notEqual(delims[0], delims[1]);
});

test('setOutput refuses a value that contains its delimiter', () => {
  const uuid = () => '00000000-0000-0000-0000-000000000000';
  const contents = withOutputFile(() => {
    assert.throws(() => setOutput('notes', 'x\nghadelimiter_00000000-0000-0000-0000-000000000000\ny', { uuid }), /delimiter/);
  });
  assert.equal(contents, '');
});
