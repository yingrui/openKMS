import { describe, expect, it } from 'vitest';
import { normalizeMarkdownMath, preprocessRichMarkdown } from './normalizeMarkdownMath';

describe('normalizeMarkdownMath', () => {
  it('converts \\[ \\] display math to $$', () => {
    const src = 'Before\n\\[\n2Be + O_2\n\\]\nAfter';
    expect(normalizeMarkdownMath(src)).toContain('$$\n2Be + O_2\n$$');
  });

  it('converts \\( \\) inline math to $', () => {
    expect(normalizeMarkdownMath('surface \\(\\mathrm{BeO}\\) ok')).toBe('surface $\\mathrm{BeO}$ ok');
  });

  it('converts AI bracket-wrapped chemistry equations', () => {
    const src = `[ \\text{2Be} + \\text{O}_2 \\xrightarrow{\\Delta} \\text{2BeO} ]`;
    const out = normalizeMarkdownMath(src);
    expect(out).toContain('$$');
    expect(out).toContain('\\text{2Be}');
    expect(out).not.toMatch(/^\[/);
  });

  it('does not touch wikilinks', () => {
    const src = 'See [[BeO|oxide]] and list [item].';
    expect(normalizeMarkdownMath(src)).toBe(src);
  });

  it('does not touch markdown links', () => {
    const src = 'See [Be](https://example.com) metal.';
    expect(normalizeMarkdownMath(src)).toBe(src);
  });

  it('does not rewrite fenced code', () => {
    const src = '```\n[ \\text{2Be} ]\n```\n';
    expect(normalizeMarkdownMath(src)).toBe(src);
  });

  it('preprocessRichMarkdown delegates', () => {
    expect(preprocessRichMarkdown('\\(x\\)')).toBe('$x$');
  });
});
