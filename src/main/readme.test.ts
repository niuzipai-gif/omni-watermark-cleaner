import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(path.resolve(process.cwd(), 'README.md'), 'utf8');

describe('README', () => {
  it('documents local Gemini image cleanup and its verification command', () => {
    expect(readme).toContain('PNG');
    expect(readme).toContain('WEBP');
    expect(readme).toContain('locally');
    expect(readme).toContain('original dimensions');
    expect(readme).toContain('npm run smoke:image-watermark');
  });
});
