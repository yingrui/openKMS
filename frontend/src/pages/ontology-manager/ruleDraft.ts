import type { QualityRuleResponse } from '../../data/qualityApi';

/** What the editor's form holds, in the shape the API takes back. */
export interface RuleDraft {
  name: string;
  column: string | null;
  config: Record<string, unknown>;
}

/**
 * JSON with **sorted keys**, recursively.
 *
 * Comparing a draft with the saved rule by `JSON.stringify` looked right and was wrong: the config is
 * stored as JSONB, and JSONB reorders object keys (Postgres normalizes them), so `{"min":0.1,"max":300}`
 * came back as `{"max":300,"min":0.1}` and every rule looked modified — the page told the reader to
 * "save first" about a rule they had not touched.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function sameConfig(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/**
 * Is there something to lose? Run executes the **saved** rule, so this is what decides whether it can
 * be offered at all.
 */
export function isRuleDraftDirty(rule: QualityRuleResponse, draft: RuleDraft): boolean {
  return (
    draft.name !== rule.name ||
    (draft.column ?? '') !== (rule.column_name ?? '') ||
    !sameConfig(draft.config, rule.config ?? {})
  );
}
