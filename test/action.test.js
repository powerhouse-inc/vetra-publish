import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stepState } from '../src/inputs.js';

const yml = fs.readFileSync(new URL('../action.yml', import.meta.url), 'utf8');
const PREPARE_OUTPUTS = ['kind', 'version', 'notes', 'release-branch', 'production', 'image-name', 'image-ref', 'image-digest', 'powerhouse', 'base-image', 'publish', 'skipped', 'registry'];

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

test('without a host Dockerfile (prepare sets skipped) nothing is attested, built or reported', () => {
  const skip = "if: steps.prepare.outputs.skipped != 'true'";
  assert.match(yml, new RegExp(`- name: Attest the host image\\n\\s+${skip.replace(/[.$()]/g, '\\$&')}\\n\\s+uses: actions/attest-build-provenance`));
  assert.match(yml, new RegExp(`- name: Packages and report\\n\\s+id: finish\\n\\s+${skip.replace(/[.$()]/g, '\\$&')}\\n`));
  // install and build run only when prepare says publish, which it sets false.
  assert.equal((yml.match(/if: steps\.prepare\.outputs\.publish == 'true'/g) ?? []).length, 2);
});

test('finish gets every VETRA_* value stepState reads', () => {
  const env = Object.fromEntries([...yml.matchAll(/^\s+(VETRA_[A-Z_]+): \$\{\{ steps\.prepare\.outputs\.([a-z-]+) \}\}$/gm)].map((m) => [m[1], 'x']));
  assert.doesNotThrow(() => stepState(env));
  assert.equal(Object.keys(env).length, 9);
});

test('action.yml always logs out of the registry prepare logged in to', () => {
  assert.match(yml, /- name: Log out of the registry\n\s+if: always\(\) && steps\.prepare\.outputs\.registry != ''\n\s+shell: bash\n\s+run: docker logout "\$\{\{ steps\.prepare\.outputs\.registry \}\}"/);
  assert.doesNotMatch(yml, /docker logout cr\.vetra\.io/);
});
