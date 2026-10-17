import { describe, expect, it } from 'vitest';
import { highlightSql } from './sqlHighlight';

const kinds = (sql: string) => highlightSql(sql).map((t) => t.kind);
const colour = (sql: string, text: string) =>
  highlightSql(sql).filter((t) => t.text === text).map((t) => t.kind);

describe('highlightSql', () => {
  it('changes nothing about the text — the invariant an overlay editor depends on', () => {
    const sql = `SELECT count(*) FROM {{table}} -- why\nWHERE "pe_ttm" > 100 AND name = 'it''s'`;
    expect(
      highlightSql(sql)
        .map((t) => t.text)
        .join(''),
    ).toBe(sql);
  });

  it('knows keywords, case-insensitively, and leaves identifiers alone', () => {
    expect(colour('select count(*) from t', 'select')).toEqual(['keyword']);
    expect(colour('select count(*) from t', 'from')).toEqual(['keyword']);
    expect(colour('select count(*) from t', 'count')).toEqual(['keyword']);
    expect(colour('select close from t', 'close')).toEqual([]);
    expect(colour('select t.close from t', 'close')).toEqual([]);
  });

  it('colours the {{placeholders}} this app puts in rule queries', () => {
    expect(kinds('SELECT count(*) FROM {{table}}')).toContain('placeholder');
    expect(colour('WHERE {{column}} > 1', '{{column}}')).toEqual(['placeholder']);
  });

  it('colours strings and their doubled-quote escape as one token', () => {
    expect(colour("WHERE name = 'it''s'", "'it''s'")).toEqual(['string']);
  });

  it('does not colour a quoted identifier as a literal', () => {
    // `"pe_ttm"` is an identifier; painting it like a string teaches the wrong thing.
    expect(colour('WHERE "pe_ttm" > 100', '"pe_ttm"')).toEqual([]);
    expect(kinds('WHERE "pe_ttm" > 100')).not.toContain('string');
  });

  it('colours numbers and comments', () => {
    expect(colour('LIMIT 100', '100')).toEqual(['number']);
    expect(colour('SELECT 1.5', '1.5')).toEqual(['number']);
    expect(colour('SELECT 1 -- comment', '-- comment')).toEqual(['comment']);
    expect(colour('SELECT /* a */ 1', '/* a */')).toEqual(['comment']);
  });

  it('survives what an author types mid-edit', () => {
    // an unterminated string, comment and placeholder are normal while typing
    expect(highlightSql("SELECT 'abc").map((t) => t.text).join('')).toBe("SELECT 'abc");
    expect(highlightSql('SELECT /* abc').map((t) => t.text).join('')).toBe('SELECT /* abc');
    expect(highlightSql('SELECT {{ta').map((t) => t.text).join('')).toBe('SELECT {{ta');
  });
});
