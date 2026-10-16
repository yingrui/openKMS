import { describe, expect, it } from 'vitest';
import { csvFileName, toCsv } from './reportCsv';

describe('toCsv', () => {
  it('writes a header row and one line per row', () => {
    const csv = toCsv(['industry', 'value'], [
      { industry: '银行', value: 6.07 },
      { industry: '保险', value: 6.65 },
    ]);
    expect(csv).toBe('\uFEFFindustry,value\r\n银行,6.07\r\n保险,6.65\r\n');
  });

  it('quotes only what needs it, and doubles quotes inside', () => {
    const csv = toCsv(['a', 'b', 'c'], [
      { a: 'plain', b: 'has,comma', c: 'has "quote"' },
      { a: 'has\nnewline', b: 'has\r\ncrlf', c: 'has\r' },
    ]);
    // The first record splits cleanly; the second cannot — its fields contain newlines, and quoting
    // is exactly what makes that legal, so assert on the text rather than splitting it apart again.
    const [header, first] = csv.replace('\uFEFF', '').split('\r\n');
    expect(header).toBe('a,b,c');
    expect(first).toBe('plain,"has,comma","has ""quote"""');
    expect(csv).toContain('"has\nnewline","has\r\ncrlf","has\r"');
  });

  it('writes a null or missing cell as empty, never the word null', () => {
    const csv = toCsv(['a', 'b'], [{ a: null, b: undefined }]);
    expect(csv.split('\r\n')[1]).toBe(',');
    expect(csv).not.toMatch(/null|undefined/);
  });

  it('keeps a number a number and a date as the API spelled it', () => {
    const csv = toCsv(['n', 'd'], [{ n: 1007340, d: '2026-01-01T00:00:00+00:00' }]);
    expect(csv.split('\r\n')[1]).toBe('1007340,2026-01-01T00:00:00+00:00');
  });

  it('serializes a value that is not a scalar rather than dropping it', () => {
    const csv = toCsv(['a'], [{ a: { nested: true } }]);
    expect(csv.split('\r\n')[1]).toBe('"{""nested"":true}"');
  });

  it('is the header alone for a result with no rows', () => {
    expect(toCsv(['a', 'b'], [])).toBe('\uFEFFa,b\r\n');
  });
});

describe('csvFileName', () => {
  it('uses the first usable name and makes it safe', () => {
    expect(csvFileName('行业平均市盈率：最低的 8 个')).toBe('行业平均市盈率：最低的 8 个.csv');
    expect(csvFileName('a/b:c*d?e"f<g>h|i')).toBe('a-b-c-d-e-f-g-h-i.csv');
    expect(csvFileName(null, '  ', undefined)).toBe('report.csv');
    expect(csvFileName('x'.repeat(200))).toHaveLength(84);
  });
});
