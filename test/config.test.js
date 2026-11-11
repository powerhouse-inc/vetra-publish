import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_MIGRATIONS, hostDockerfile, parseVetraConfig, readVetraConfig } from '../src/config.js';

const defaults = { host: 'cli', packageDirs: ['.'], prerelease: {}, requires: {}, migrations: DEFAULT_MIGRATIONS, migrates: false };

test('no vetra section means the defaults; keys of ph vetra are ignored', () => {
  assert.deepEqual(parseVetraConfig(undefined), defaults);
  assert.deepEqual(parseVetraConfig({ connectPort: 2540, driveId: 'x' }), defaults);
});

test('reads every key the action owns', () => {
  const c = parseVetraConfig({
    host: 'cli',
    packageDirs: ['.', 'packages/sdk'],
    prerelease: { next: 'beta', canary: 'alpha' },
    requires: { powerhouse: '>=6.2.3', services: ['DOCLING'], size: 'M' },
    migrations: ['db/**'],
    migrates: true,
  });
  assert.deepEqual(c, {
    host: 'cli',
    packageDirs: ['.', 'packages/sdk'],
    prerelease: { next: 'beta', canary: 'alpha' },
    requires: { powerhouse: '>=6.2.3', services: ['DOCLING'], size: 'M' },
    migrations: ['db/**'],
    migrates: true,
  });
});

test('lists every problem at once', () => {
  assert.throws(
    () => parseVetraConfig({ host: 'CLI', prerelease: { next: 'gamma' }, requires: { size: 'huge', cpu: 2 }, migrates: 'yes' }),
    (err) => {
      for (const s of ['vetra.host', 'vetra.prerelease.next', 'vetra.requires.size', 'vetra.requires.cpu', 'vetra.migrates']) {
        assert.match(err.message, new RegExp(s.replace('.', '\\.')));
      }
      return true;
    },
  );
});

test('readVetraConfig: missing file is the defaults, bad JSON a clear error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-config-'));
  assert.deepEqual(readVetraConfig(dir), defaults);
  fs.writeFileSync(path.join(dir, 'powerhouse.config.json'), '{');
  assert.throws(() => readVetraConfig(dir), /not valid JSON/);
  fs.writeFileSync(path.join(dir, 'powerhouse.config.json'), JSON.stringify({ vetra: { host: 'desktop' } }));
  assert.equal(readVetraConfig(dir).host, 'desktop');
});

test('hostDockerfile requires hosts/<host>/Dockerfile (spec 14.11)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-host-'));
  assert.throws(() => hostDockerfile(dir, defaults), /hosts\/cli\/Dockerfile is missing.*ph generate hosts/s);
  fs.mkdirSync(path.join(dir, 'hosts/cli'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'hosts/cli/Dockerfile'), 'FROM node:24\n');
  assert.equal(hostDockerfile(dir, defaults), 'hosts/cli/Dockerfile');
});
