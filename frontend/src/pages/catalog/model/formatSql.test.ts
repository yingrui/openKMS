/**
 * Formatting must never change what the SQL says — only where the lines break.
 *
 * The statement shown in the Playground is evidence: a reviewer reads it to confirm the row
 * restriction is really there. So the tests care about two things:
 *
 * 1. the semantics survive (quoted contents untouched, placeholders intact), and
 * 2. the injected `EXISTS` becomes findable, because that is the clause being verified.
 */
import { describe, expect, it } from 'vitest';
import { formatSql, shouldFormat } from './formatSql';

const POLICY_SQL =
  'SELECT base."ts_code" AS "ts_code", j0."name" AS "name", (AVG("pe_ttm")) AS "value" ' +
  'FROM "tushare"."daily_basic" base INNER JOIN "tushare"."stock_basic" j0 ' +
  'ON base."ts_code" = j0."ts_code" ' +
  'WHERE pe_ttm > 5 AND pe_ttm < 10 AND EXISTS (SELECT 1 FROM "tushare"."stock_basic" rpo0 ' +
  'WHERE base."ts_code" = rpo0."ts_code" AND rpo0."industry" = :pc0_0) ' +
  'GROUP BY base."ts_code", j0."name" LIMIT 11';

describe('formatSql', () => {
  it('puts each clause on its own line', () => {
    const lines = formatSql(POLICY_SQL)
      .split('\n')
      .map((l) => l.trim());
    for (const keyword of ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'LIMIT']) {
      expect(lines).toContain(keyword);
    }
  });

  it('keeps a multi-word join intact', () => {
    expect(formatSql(POLICY_SQL)).toContain('INNER JOIN "tushare"."stock_basic"');
  });

  it('keeps the named placeholder whole', () => {
    const out = formatSql(POLICY_SQL);
    // A `:param` split into `: pc0_0` would still run, but it reads as a cast and confuses review.
    expect(out).toContain(':pc0_0');
    expect(out).not.toContain(': pc0_0');
  });

  it('nests the EXISTS subquery rather than inlining it', () => {
    const out = formatSql(POLICY_SQL);
    expect(out).toContain('AND EXISTS (');
    // The subquery's own clauses are indented under it, not flattened onto the outer WHERE.
    const lines = out.split('\n');
    const existsAt = lines.findIndex((l) => l.includes('AND EXISTS ('));
    expect(existsAt).toBeGreaterThanOrEqual(0);
    expect(lines[existsAt + 1].trim()).toBe('SELECT');
  });

  it('never rewrites a quoted string, even when it contains SQL keywords', () => {
    const sql = `SELECT id FROM t WHERE note = 'where and select from' AND x = 1`;
    expect(formatSql(sql)).toContain(`'where and select from'`);
  });

  it('keeps quoted identifiers intact', () => {
    const out = formatSql(POLICY_SQL);
    expect(out).toContain('"tushare"."daily_basic"');
    expect(out).toContain('"ts_code"');
  });

  it('leaves an empty statement empty', () => {
    expect(formatSql('')).toBe('');
    expect(formatSql('   ')).toBe('');
  });

  it('returns something unparseable unchanged instead of throwing', () => {
    // A display bug must never look like a query problem.
    const weird = 'SELECT FROM WHERE (((';
    expect(() => formatSql(weird)).not.toThrow();
    expect(formatSql(weird)).toBe(weird);
  });

  it('is idempotent: formatting already-formatted SQL changes nothing', () => {
    const once = formatSql(POLICY_SQL);
    expect(formatSql(once)).toBe(once);
  });
});

describe('shouldFormat', () => {
  it('skips a short statement that is clearer on one line', () => {
    expect(shouldFormat('SELECT id FROM t')).toBe(false);
  });

  it('formats a long multi-clause statement', () => {
    expect(shouldFormat(POLICY_SQL)).toBe(true);
  });
});
