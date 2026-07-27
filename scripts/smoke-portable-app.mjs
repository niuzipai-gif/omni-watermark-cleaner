import { existsSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptsDir);
const executablePath = path.join(root, 'Omni-Watermark-Cleaner-Portable', 'app', 'Omni Watermark Cleaner.exe');
const userDataDir = path.join(root, 'smoke-user-data', 'app-smoke');
const tracePath = path.join(root, 'smoke-user-data', 'app-smoke-startup.log');
const expectedEvents = ['module-loaded', 'app-ready', 'create-window', 'renderer-file-loaded', 'window-ready'];

if (!existsSync(executablePath)) {
  throw new Error(`Portable executable is missing: ${executablePath}`);
}

await mkdir(path.dirname(tracePath), { recursive: true });
await rm(tracePath, { force: true });

const app = spawn(executablePath, [], {
  detached: true,
  env: {
    ...process.env,
    OMNI_USER_DATA_DIR: userDataDir,
    OMNI_STARTUP_TRACE_PATH: tracePath
  },
  stdio: 'ignore',
  windowsHide: true
});

try {
  const trace = await waitForStartupTrace(app, tracePath, expectedEvents, 30000);
  console.log(JSON.stringify({ status: 'OK', executablePath, userDataDir, tracePath, expectedEvents, trace }, null, 2));
} finally {
  await stopProcessTree(app.pid);
}

async function waitForStartupTrace(appProcess, nextTracePath, events, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let trace = '';

  while (Date.now() < deadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`Portable app exited before startup completed with code ${appProcess.exitCode}.`);
    }

    try {
      trace = await readFile(nextTracePath, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (events.every((event) => trace.includes(event))) {
      return trace;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Portable app did not finish startup within ${timeoutMs}ms. Trace:\n${trace}`);
}

async function stopProcessTree(pid) {
  if (!pid) return;
  await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f']).catch(() => undefined);
}
