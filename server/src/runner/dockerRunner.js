/**
 * dockerRunner.js
 * ---------------
 * Runs untrusted code inside a throw-away Docker container and streams
 * stdout/stderr back chunk by chunk through the `onOutput` callback.
 *
 * How the code gets into the container
 *   We never mount host folders. Instead we pipe everything over stdin:
 *     line 1      : the source code, base64-encoded (no newlines in base64)
 *     the rest    : whatever the user typed in the "stdin" box
 *   The container's shell reads line 1 with `read`, decodes it into /tmp,
 *   then `exec`s the program, which inherits the remaining stdin.
 *
 * Sandbox restrictions (docker run flags)
 *   --rm                       container is deleted when it exits
 *   --network none             no internet / LAN access
 *   --memory / --memory-swap   RAM cap, no swap
 *   --cpus                     CPU cap
 *   --pids-limit 64            stops fork bombs
 *   --read-only + --tmpfs /tmp root filesystem is read-only; only a small /tmp is writable
 *   --cap-drop ALL             no Linux capabilities
 *   --security-opt no-new-privileges
 *   --user 65534:65534         runs as "nobody", not root
 *   + a time limit (`timeout` inside the container, so slow container start-up
 *     doesn't count; a longer host-side backstop does `docker rm -f`)
 *   + an output size cap
 */
const { spawn } = require('child_process');
const crypto = require('crypto');
const config = require('../config');
const { languages } = require('./languages');

function runInDocker({ language, code, stdin = '', onOutput }) {
  const lang = languages[language];
  if (!lang) return Promise.reject(new Error(`Unsupported language: ${language}`));

  const { timeoutMs, cpus, maxOutputBytes } = config.run;
  // Compiled/JVM languages may need more RAM than the default (see languages.js)
  const memory = lang.memory || config.run.memory;
  const containerName = `codesync-run-${crypto.randomUUID()}`;

  // Shell script executed inside the container (see header comment).
  // The time limit is enforced INSIDE the container with `timeout`, so it
  // only counts the user's program - not Docker's container start-up, which
  // can take several seconds (especially the first run after Docker starts).
  const limitSecs = Math.ceil(timeoutMs / 1000);
  const script =
    `IFS= read -r CODE_B64; ` +
    `printf '%s' "$CODE_B64" | base64 -d > /tmp/${lang.file} && ` +
    `exec timeout -s KILL ${limitSecs} sh -c '${lang.run}'`;

  const args = [
    'run',
    ...(config.run.keepContainers ? [] : ['--rm']), // see RUN_KEEP_CONTAINERS in .env
    '-i',
    '--label', 'codesync=run', // lets you filter these containers in Docker Desktop / CLI
    // --init: a tiny init process becomes PID 1. Without it the user's program
    // can end up as PID 1, which ignores signals - so `timeout` couldn't kill it.
    '--init',
    '--name', containerName,
    '--network', 'none',
    '--memory', memory,
    '--memory-swap', memory,
    '--cpus', String(cpus),
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/tmp:rw,exec,nosuid,size=64m',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    '--user', '65534:65534',
    '--workdir', '/tmp',
    lang.image,
    'sh', '-c', script,
  ];

  return new Promise((resolve) => {
    const started = Date.now();
    let outputBytes = 0;
    let truncated = false;
    let timedOut = false;
    let finished = false;

    const child = spawn('docker', args, { windowsHide: true });

    const killContainer = () => {
      // `docker rm -f` kills AND removes the container - it also cleans up a
      // container that was created but never started (which `docker kill` can't).
      spawn('docker', ['rm', '-f', containerName], { windowsHide: true }).on('error', () => {});
      child.kill();
    };

    // Backstop only: the real limit is `timeout` inside the container. This
    // fires if the container itself hangs (e.g. Docker stuck starting it).
    const BACKSTOP_GRACE_MS = 30000;
    const timer = setTimeout(() => {
      timedOut = true;
      onOutput('system', `\n[Sandbox did not finish in time - container removed]\n`);
      killContainer();
    }, timeoutMs + BACKSTOP_GRACE_MS);

    const forward = (stream) => (chunk) => {
      if (truncated) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        truncated = true;
        onOutput('system', `\n[Output limit of ${maxOutputBytes} bytes exceeded - process killed]\n`);
        killContainer();
        return;
      }
      onOutput(stream, chunk.toString('utf8'));
    };

    child.stdout.on('data', forward('stdout'));
    child.stderr.on('data', forward('stderr'));

    const finish = (exitCode) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      // 137 = killed with SIGKILL: either our in-container `timeout` or the
      // kernel's out-of-memory killer. Elapsed time tells them apart.
      if (exitCode === 137 && !truncated && !timedOut) {
        if (Date.now() - started >= timeoutMs) {
          timedOut = true;
          onOutput('system', `\n[Time limit of ${limitSecs}s exceeded - process killed]\n`);
        } else {
          onOutput('system', `\n[Process killed - probably exceeded the ${memory} memory limit]\n`);
        }
      }
      resolve({ exitCode, timedOut, truncated, durationMs: Date.now() - started });
    };

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        onOutput('system', '[Docker CLI not found. Install Docker Desktop / Docker Engine and make sure `docker` is on PATH.]\n');
      } else {
        onOutput('system', `[Failed to start docker: ${err.message}]\n`);
      }
      finish(-1);
    });

    child.on('close', (code) => finish(code ?? -1));

    // Feed the program: line 1 = base64 code, then the user's stdin.
    child.stdin.on('error', () => {}); // ignore EPIPE if the program exits early
    child.stdin.write(Buffer.from(code, 'utf8').toString('base64') + '\n');
    child.stdin.end(stdin);
  });
}

module.exports = { runInDocker };
