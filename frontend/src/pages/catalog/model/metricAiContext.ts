/** Metric `ai_context`: what an agent can rely on, edited as plain text in the metric form. */
import type { MetricAiContext } from '../../../data/metricsApi';

/** Comma/·-separated text → the list keys a consumer reads; empty lists are dropped. */
export function aiContextPayload(
  instructions: string,
  synonyms: string,
  examples: string,
  notFor: string,
): MetricAiContext | null {
  const list = (raw: string, sep: RegExp) =>
    raw
      .split(sep)
      .map((x) => x.trim())
      .filter(Boolean);
  const out: MetricAiContext = {};
  if (instructions.trim()) out.instructions = instructions.trim();
  const syn = list(synonyms, /[,，]/);
  if (syn.length) out.synonyms = syn;
  const ex = list(examples, /[·|，,]/);
  if (ex.length) out.examples = ex;
  const notForList = list(notFor, /[,，]/);
  if (notForList.length) out.not_for = notForList;
  return Object.keys(out).length ? out : null;
}

/** The reverse, for opening a saved metric in the form. */
export function aiContextFields(context: MetricAiContext | null | undefined): {
  instructions: string;
  synonyms: string;
  examples: string;
  notFor: string;
} {
  return {
    instructions: typeof context?.instructions === 'string' ? context.instructions : '',
    synonyms: (context?.synonyms ?? []).join(', '),
    examples: (context?.examples ?? []).join(' · '),
    notFor: (context?.not_for ?? []).join(', '),
  };
}
