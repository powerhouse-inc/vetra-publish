// The base image a host Dockerfile builds on (reported as built.baseImage):
// what the final stage starts FROM, through stage aliases, with global ARG
// defaults (or --build-arg values) substituted.

function logicalLines(text) {
  return text
    .replace(/\\\r?\n/g, ' ')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function substitute(value, vars) {
  return value.replace(/\$\{(\w+)(?::-([^}]*))?\}|\$(\w+)/g, (_, braced, fallback, bare) => {
    const v = vars[braced ?? bare];
    return v !== undefined && v !== '' ? v : (fallback ?? '');
  });
}

export function baseImageOf(text, buildArgs = {}) {
  const globals = {};
  const stages = new Map();
  let last = null;
  for (const line of logicalLines(text)) {
    const [instruction, ...rest] = line.split(/\s+/);
    const op = instruction.toUpperCase();
    if (op === 'ARG' && last === null) {
      const [name, ...value] = rest.join(' ').split('=');
      const key = name.trim();
      globals[key] = buildArgs[key] ?? (value.length ? value.join('=').trim().replace(/^"(.*)"$/, '$1') : '');
    } else if (op === 'FROM') {
      const args = rest.filter((a) => !a.startsWith('--'));
      const image = substitute(args[0] ?? '', globals);
      if (!image) throw new Error(`Dockerfile: FROM without an image: ${line}`);
      last = stages.get(image.toLowerCase()) ?? image;
      if (args[1]?.toUpperCase() === 'AS' && args[2]) stages.set(args[2].toLowerCase(), last);
    }
  }
  if (last === null) throw new Error('Dockerfile has no FROM');
  return last;
}
