// Bundles each entry point with ncc into dist/<entry>/index.js (ESM, with
// release-please's template files next to it). dist/ is committed: the
// action runs it without an install. The check CLI keeps a shebang.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const entries = (process.argv[2] ?? 'prepare,finish,check').split(',');
for (const entry of entries) {
  fs.rmSync(`dist/${entry}`, { recursive: true, force: true });
  execFileSync('npx', ['ncc', 'build', `src/${entry}.js`, '-o', `dist/${entry}`, '--quiet', '--license', 'licenses.txt'], { stdio: 'inherit' });
}
const cli = 'dist/check/index.js';
if (fs.existsSync(cli)) {
  const text = fs.readFileSync(cli, 'utf8');
  if (!text.startsWith('#!')) fs.writeFileSync(cli, `#!/usr/bin/env node\n${text}`);
  fs.chmodSync(cli, 0o755);
}
