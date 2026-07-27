import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  build: { win: { icon?: string } };
};

describe('portable packaging', () => {
  it('keeps the Electron Builder ASAR intact and sets the Windows icon', () => {
    expect(packageJson.scripts['package:portable-folder']).not.toContain('sync:release-app');
    expect(packageJson.build.win.icon).toBe('assets/omni-cleaner.ico');
  });
});
