import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MIGRATIONS } from '../src/config.js';
import { computeMigrates, globToRegExp, previousRelease, touchesMigrations } from '../src/migrates.js';

test('globToRegExp: * within a segment, ** across segments', () => {
  assert.ok(globToRegExp('processors/*/migrations.ts').test('processors/email-index/migrations.ts'));
  assert.ok(!globToRegExp('processors/*/migrations.ts').test('processors/a/b/migrations.ts'));
  assert.ok(globToRegExp('document-models/*/upgrades/**').test('document-models/invoice/upgrades/v2/up.ts'));
  assert.ok(globToRegExp('**/schema.sql').test('db/x/schema.sql'));
  assert.ok(globToRegExp('**/schema.sql').test('schema.sql'));
  assert.ok(!globToRegExp('a.ts').test('aXts'));
});

test('touchesMigrations with the default folders', () => {
  assert.equal(touchesMigrations(['editors/x.tsx', 'processors/files-index/migrations.ts'], DEFAULT_MIGRATIONS), true);
  assert.equal(touchesMigrations(['editors/x.tsx', 'processors/files-index/processor.ts'], DEFAULT_MIGRATIONS), false);
});

const tags = (list) => (cmd, args) => {
  if (args[0] === 'tag') return list.join('\n');
  if (args[0] === 'diff') return `processors/a/migrations.ts\nREADME.md\n`;
  return '';
};

test('previousRelease: a full release migrates from the previous full release, a prerelease from any earlier release', () => {
  const exec = tags(['v1.3.0', 'v1.4.0', 'v2.0.0-beta.3', 'v1.5.0-main.2', 'vnext']);
  assert.equal(previousRelease('2.0.0', exec), 'v1.4.0');
  assert.equal(previousRelease('2.0.0-beta.4', exec), 'v2.0.0-beta.3');
  assert.equal(previousRelease('1.0.0', exec), null);
  assert.equal(previousRelease('1.0.0', () => { throw new Error('no HEAD^'); }), null);
});

test('computeMigrates: the config override, then the diff since the previous release', () => {
  const config = { migrations: DEFAULT_MIGRATIONS, migrates: false };
  assert.equal(computeMigrates({ version: '1.5.0', config }, tags(['v1.4.0'])), true);
  assert.equal(computeMigrates({ version: '1.5.0', config }, tags([])), false);
  assert.equal(computeMigrates({ version: '1.5.0', config: { ...config, migrates: true } }, tags([])), true);
  assert.equal(computeMigrates({ version: '1.5.0', config: { ...config, migrations: ['db/**'] } }, tags(['v1.4.0'])), false);
});
