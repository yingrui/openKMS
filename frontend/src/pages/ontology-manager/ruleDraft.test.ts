import { describe, expect, it } from 'vitest';
import type { QualityRuleResponse } from '../../data/qualityApi';
import { canonicalJson, isRuleDraftDirty, sameConfig } from './ruleDraft';

const rule = (over: Partial<QualityRuleResponse> = {}): QualityRuleResponse => ({
  id: 'r',
  dataset_id: 'ds',
  name: 'pe_ttm 在可信区间内',
  rule_type: 'range',
  column_name: 'pe_ttm',
  config: { max: 300, min: 0.1 },
  severity: 'warning',
  enabled: true,
  created_by_name: null,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
  last_status: 'failed',
  last_run_at: '2026-10-16T00:00:00Z',
  ...over,
});

describe('canonicalJson', () => {
  it('ignores key order, because JSONB does not keep it', () => {
    expect(canonicalJson({ max: 300, min: 0.1 })).toBe(canonicalJson({ min: 0.1, max: 300 }));
  });

  it('sorts nested objects too, and keeps array order', () => {
    expect(canonicalJson({ a: { y: 1, x: 2 } })).toBe(canonicalJson({ a: { x: 2, y: 1 } }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('tells values apart, including a number and its text', () => {
    expect(canonicalJson({ min: 0.1 })).not.toBe(canonicalJson({ min: '0.1' }));
    expect(canonicalJson({})).not.toBe(canonicalJson({ min: 0.1 }));
  });
});

describe('sameConfig', () => {
  it('is the value comparison the page builds on', () => {
    expect(sameConfig({ max: 300, min: 0.1 }, { min: 0.1, max: 300 })).toBe(true);
    expect(sameConfig({ min: 0.1 }, { min: 0.2 })).toBe(false);
  });
});

describe('isRuleDraftDirty', () => {
  it('a rule just opened is not dirty — the keys come back in another order, that is all', () => {
    // The exact live case: the API returned {max:300,min:0.1}, the form builds {min:0.1,max:300}.
    expect(
      isRuleDraftDirty(rule({ config: { max: 300, min: 0.1 } }), {
        name: 'pe_ttm 在可信区间内',
        column: 'pe_ttm',
        config: { min: 0.1, max: 300 },
      }),
    ).toBe(false);
  });

  it('a changed threshold is a draft', () => {
    expect(
      isRuleDraftDirty(rule(), { name: 'pe_ttm 在可信区间内', column: 'pe_ttm', config: { min: 0.5, max: 300 } }),
    ).toBe(true);
  });

  it('clearing a bound is a draft, not an unchanged rule', () => {
    expect(
      isRuleDraftDirty(rule(), { name: 'pe_ttm 在可信区间内', column: 'pe_ttm', config: { max: 300 } }),
    ).toBe(true);
  });

  it('watches the name and the column too', () => {
    const draft = { name: 'pe_ttm 在可信区间内', column: 'pe_ttm', config: { max: 300, min: 0.1 } };
    expect(isRuleDraftDirty(rule(), { ...draft, name: 'PE' })).toBe(true);
    expect(isRuleDraftDirty(rule(), { ...draft, column: 'pe' })).toBe(true);
    expect(isRuleDraftDirty(rule({ column_name: null }), { ...draft, column: '' })).toBe(false);
  });
});
