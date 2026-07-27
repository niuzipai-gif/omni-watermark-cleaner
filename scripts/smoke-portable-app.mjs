import { _electron as electron } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(scriptsDir);
const executablePath = path.join(root, 'Omni-Watermark-Cleaner-Portable', 'app', 'Omni Watermark Cleaner.exe');
const userDataDir = path.join(root, 'smoke-user-data', 'app-smoke');

const app = await electron.launch({
  executablePath,
  env: {
    ...process.env,
    OMNI_USER_DATA_DIR: userDataDir
  }
});
try {
  const win = await app.firstWindow({ timeout: 15000 });
  const messages = [];
  win.on('console', (message) => messages.push({ type: message.type(), text: message.text() }));
  win.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));
  await win.waitForTimeout(2000);

  const result = await win.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText ?? '',
    hasOmniApi: Boolean(window.omni),
    hasGetPathForFile: typeof window.omni?.getPathForFile === 'function',
    hasEnqueueVideos: typeof window.omni?.enqueueVideos === 'function'
  }));

  const failures = [];
  if (result.title !== 'Omni Watermark Cleaner') failures.push(`Unexpected title: ${result.title}`);
  if (!result.bodyText.includes('Omni Watermark Cleaner')) failures.push('Renderer body text is missing app title');
  if (!result.hasOmniApi) failures.push('window.omni preload API is missing');
  if (!result.hasGetPathForFile) failures.push('window.omni.getPathForFile is missing');
  if (!result.hasEnqueueVideos) failures.push('window.omni.enqueueVideos is missing');
  if (messages.some((message) => message.type === 'pageerror')) failures.push(`Page errors: ${JSON.stringify(messages)}`);

  if (failures.length > 0) {
    throw new Error(failures.join('\n'));
  }

  console.log(JSON.stringify({ status: 'OK', executablePath, userDataDir, ...result }, null, 2));
} finally {
  await app.close().catch(() => undefined);
}
