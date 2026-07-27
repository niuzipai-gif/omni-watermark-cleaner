import path from 'node:path';

export function resolveBundledPlaywrightBrowsersPath(
  resourcesPath: string,
  exists: (candidate: string) => boolean
): string | null {
  const bundledPath = path.join(resourcesPath, 'ms-playwright');
  return exists(bundledPath) ? bundledPath : null;
}

export function configureBundledPlaywrightBrowsers(
  resourcesPath: string,
  exists: (candidate: string) => boolean,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const bundledPath = resolveBundledPlaywrightBrowsersPath(resourcesPath, exists);
  if (bundledPath) {
    env.PLAYWRIGHT_BROWSERS_PATH = bundledPath;
  }
  return bundledPath;
}
