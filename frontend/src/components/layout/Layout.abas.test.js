import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('abas internas da pasta', () => {
  it('mantém o destaque visual de ampliação ao passar o mouse', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/layout/Layout.css'), 'utf8');
    expect(css).toContain('.aba-btn:hover');
    expect(css).toContain('transform: scale(1.4)');
    expect(css).toContain('transform-origin: center bottom');
  });
});
