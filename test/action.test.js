import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepState } from '../src/inputs.js';

const yml = fs.readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
const PREPARE_OUTPUTS = ['kind', 'version', 'notes', 'release-branch', 'production', 'image-name', 'image-ref', 'image-digest', 'powerhouse', 'base-image', 'publish'];

test('action.yml runs the bundled entry points', () => {
  assert.match(yml, /node "\$\{\{ github\.action_path \}\}\/dist\/prepare\/index\.js"/);
  assert.match(yml, /node "\$\{\{ github\.action_path \}\}\/dist\/finish\/index\.js"/);
});

test('action.yml attests the registry digest of cr.vetra.io/<repository>', () => {
  assert.match(yml, /uses: actions\/attest-build-provenance@v2\n\s+with:\n\s+subject-name: \$\{\{ steps\.prepare\.outputs\.image-name \}\}\n\s+subject-digest: \$\{\{ steps\.prepare\.outputs\.image-digest \}\}/);
});

test('action.yml reads only outputs prepare writes', () => {
  const used = [...yml.matchAll(/steps\.prepare\.outputs\.([a-z-]+)/g)].map((m) => m[1]);
  for (const name of used) assert.ok(PREPARE_OUTPUTS.includes(name), name);
});

test('finish gets every VETRA_* value stepState reads', () => {
  const env = Object.fromEntries([...yml.matchAll(/^\s+(VETRA_[A-Z_]+): \$\{\{ steps\.prepare\.outputs\.([a-z-]+) \}\}$/gm)].map((m) => [m[1], 'x']));
  assert.doesNotThrow(() => stepState(env));
  assert.equal(Object.keys(env).length, 9);
});
