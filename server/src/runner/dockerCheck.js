/**
 * dockerCheck.js
 * --------------
 * Makes sure the `docker` command can be found, and reports whether the
 * Docker engine is running. Called once at server start-up.
 *
 * Why: a terminal opened BEFORE Docker Desktop was installed has an old PATH
 * without `docker`, so a server started from it can't launch sandboxes.
 * If `docker` isn't on PATH we look in the usual install folders and add the
 * one we find to this process's PATH. Set DOCKER_BIN_DIR to override.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CANDIDATE_DIRS = [
  process.env.DOCKER_BIN_DIR,
  'C:\\Program Files\\Docker\\Docker\\resources\\bin', // Docker Desktop (Windows)
  '/usr/local/bin', // Docker Desktop (macOS)
  '/opt/homebrew/bin',
  '/usr/bin',
].filter(Boolean);

const exe = process.platform === 'win32' ? 'docker.exe' : 'docker';

function dockerOnPath() {
  const r = spawnSync('docker', ['--version'], { windowsHide: true });
  return !r.error && r.status === 0;
}

function ensureDockerOnPath() {
  if (dockerOnPath()) return true;
  for (const dir of CANDIDATE_DIRS) {
    if (fs.existsSync(path.join(dir, exe))) {
      process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
      if (dockerOnPath()) {
        console.log(`[docker] 'docker' was not on PATH - using ${dir}`);
        return true;
      }
    }
  }
  return false;
}

/** Returns { cli: boolean, engine: boolean, version?: string } */
function checkDocker() {
  const cli = ensureDockerOnPath();
  if (!cli) return { cli: false, engine: false };
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
  });
  const version = (r.stdout || '').trim();
  return { cli: true, engine: r.status === 0 && Boolean(version), version };
}

/** Language ids whose Docker image is not present locally. */
function missingImages() {
  const { languages } = require('./languages');
  return Object.entries(languages)
    .filter(([, l]) => spawnSync('docker', ['image', 'inspect', l.image], { windowsHide: true }).status !== 0)
    .map(([id, l]) => `${id} (${l.image})`);
}

function logDockerStatus() {
  const s = checkDocker();
  if (!s.cli) {
    console.warn('[docker] Docker CLI not found - "Run" will not work. Install Docker Desktop / Docker Engine.');
  } else if (!s.engine) {
    console.warn('[docker] Docker is installed but the engine is not running - start Docker Desktop.');
  } else {
    console.log(`[docker] engine ${s.version} ready`);
    const missing = missingImages();
    if (missing.length) {
      console.warn(`[docker] images missing for: ${missing.join(', ')}`);
      console.warn('[docker] run "npm run pull-images" once (it also builds the custom Go image).');
    }
  }
  return s;
}

module.exports = { checkDocker, logDockerStatus };
