/**
 * Type hierarchy, as a test.
 *
 * Three bugs shipped this way, and none of them was a typo: a rule was right in isolation and wrong in context.
 *
 * - a table's description (`.page-subtitle`, sized for prose under a page title) came out **larger** than the name it
 *   described, because the row borrowed a page-level class;
 * - a card's title was 1px above its own description, so it did not read as a title at all;
 * - a detail view's section heading was larger than the object it belongs to ("Usage" above "Operations").
 *
 * A screenshot shows each one, but only after someone looks. These assertions read the stylesheets and fail in CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DS = join(__dirname);
const STYLES = join(__dirname, '..');

/** `--text-md: 0.875rem` → 0.875, so declarations can be compared as numbers. */
function scale(): Record<string, number> {
  const css = readFileSync(join(DS, '_css-variables.scss'), 'utf8');
  const out: Record<string, number> = {};
  for (const [, name, value] of css.matchAll(/--(text-[a-z0-9-]+):\s*([\d.]+)rem/g)) {
    out[name] = Number(value);
  }
  return out;
}

const SCALE = scale();

/** The size a declaration block asks for, either a token or a literal rem/px. */
function sizeOf(css: string, selector: string): number | null {
  const index = css.indexOf(selector);
  if (index < 0) return null;
  const block = css.slice(index, css.indexOf('}', index));
  const token = block.match(/font-size:\s*var\(--(text-[a-z0-9-]+)\)/);
  if (token) return SCALE[token[1]] ?? null;
  const literal = block.match(/font-size:\s*([\d.]+)(rem|px)/);
  if (!literal) return null;
  const value = Number(literal[1]);
  // 1rem = 16px, the root size the tokens are written against.
  return literal[2] === 'rem' ? value : value / 16;
}

describe('type hierarchy', () => {
  it('a card title is larger than the description under it', () => {
    const css = readFileSync(join(DS, '_resource-list.scss'), 'utf8');
    const title = sizeOf(css, '.ds-resource-list-card h3');
    const desc = sizeOf(css, '.ds-resource-list-desc');
    expect(title).not.toBeNull();
    expect(desc).not.toBeNull();
    // A description is body-secondary text: never above `--text-md`, and always below its title. The shipped bug was 17
    // over 16 — "greater" alone would have passed it, so the ceiling is the assertion that matters.
    expect(desc!).toBeLessThanOrEqual(SCALE['text-md']);
    expect(title!).toBeGreaterThan(desc!);
  });

  it('a table row name is not smaller than the description under it', () => {
    const css = readFileSync(join(DS, '_view-toggle.scss'), 'utf8');
    // The link sets no size of its own: it inherits the table's, which is the point — the row's subject is read at the
    // table's size, and the description under it one step below.
    const name = sizeOf(css, '.ds-resource-table__link') ?? sizeOf(css, '.ds-resource-table {');
    const desc = sizeOf(css, '.ds-resource-table td .page-subtitle');
    expect(name).not.toBeNull();
    expect(desc).not.toBeNull();
    expect(name!).toBeGreaterThanOrEqual(desc!);
  });

  it('a card title and a row name in the same list agree about the size of a name', () => {
    const card = sizeOf(readFileSync(join(DS, '_resource-list.scss'), 'utf8'), '.ds-resource-list-card h3');
    const row = sizeOf(readFileSync(join(DS, '_view-toggle.scss'), 'utf8'), '.ds-resource-table__link');
    expect(card).not.toBeNull();
    expect(row).not.toBeNull();
    // At most one step apart: 18/16 reads as the same hierarchy; 18/14 read as two different lists.
    expect(Math.abs(SCALE['text-lg'] - SCALE['text-base'])).toBeGreaterThan(0);
    expect(row!).toBeGreaterThanOrEqual(SCALE['text-base']);
    expect(card! - row!).toBeLessThanOrEqual(SCALE['text-sm']);
  });

  it('a detail view names its object at least as loudly as the section it is on', () => {
    const css = readFileSync(join(STYLES, 'entity-view.scss'), 'utf8');
    const object = sizeOf(css, '.entity-view__title');
    const section = sizeOf(css, '  .page-header h1');
    const heading = section ?? sizeOf(css, '.entity-view__main .page-header h1');
    expect(object).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(object!).toBeGreaterThanOrEqual(heading!);
  });
});
