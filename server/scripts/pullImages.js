/**
 * Prepares every Docker image listed in src/runner/languages.js.
 * Run once before the first use:  npm run pull-images
 *
 *   - normal languages: `docker pull <image>`
 *   - languages with `build` (e.g. Go): `docker build -t <image> <folder>`
 *     (Go's image pre-compiles the standard library so runs take ~1 s, not ~25 s)
 *
 * Without this, the first run of each language waits for the download and may hit
 * the time limit - and a custom image (codesync-go) can't be downloaded at all.
 */
const path = require('path');
const { spawnSync } = require('child_process');
const { languages } = require('../src/runner/languages');

const serverDir = path.join(__dirname, '..');
const done = new Set();
let failed = false;

for (const [id, lang] of Object.entries(languages)) {
  if (done.has(lang.image)) continue;
  done.add(lang.image);

  const args = lang.build
    ? ['build', '-t', lang.image, path.join(serverDir, lang.build)]
    : ['pull', lang.image];

  console.log(`\n[${id}] > docker ${args.join(' ')}`);
  const res = spawnSync('docker', args, { stdio: 'inherit' });
  if (res.error) {
    console.error(`Could not run docker: ${res.error.message}`);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`[${id}] FAILED (exit ${res.status})`);
    failed = true;
  }
}

console.log(failed ? '\nSome images failed - see above.' : '\nAll sandbox images are ready.');
process.exit(failed ? 1 : 0);
