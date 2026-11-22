import type { KbAgentConfig } from '../../data/knowledgeBasesApi';
import { mergeAgentConfig } from './agentConfigMerge';

/**
 * The form's own shape: strings for numeric inputs, so a half-typed number is not silently coerced.
 *
 * `retrieval` is absent on purpose — how deep to search is a property of the knowledge source, not of
 * the service. The form must not offer it, or the same knowledge would be searched two different ways
 * depending on which screen the reader happened to open.
 */
export interface BehaviourDraft {
  agentsMd: string;
  /** First paragraph of the system prompt; empty uses the built-in text. */
  systemPrompt: string;
  modelId: string;
  /** Empty means "whatever the deployment does" — the field is a string so a half-typed number is not coerced. */
  temperature: string;
  topP: string;
  maxTokens: string;
  thinking: 'on' | 'off';
  /** '' = the model's own default. Only meaningful while thinking is on. */
  reasoningEffort: '' | 'low' | 'high' | 'max';
  unknownMeasure: 'try_anyway' | 'refuse';
  grounding: 'off' | 'mark' | 'enforce';
  schemaLookup: boolean;
  requireCitations: 'off' | 'require';
  /** Empty = no limit. */
  maxAnswerChars: string;
  /** What a refused caller reads, and where they go next. Empty = the built-in wording. */
  refusalText: string;
  refusalContact: string;
  /** What callers read while the agent is paused. Empty = the built-in line. */
  pausedMessage: string;
  maxToolRounds: string;
  sandbox: boolean;
}

export function draftFromConfig(cfg: KbAgentConfig | null | undefined): BehaviourDraft {
  const c = cfg ?? {};
  return {
    agentsMd: c.prompts?.agents_md ?? '',
    systemPrompt: c.prompts?.system_prompt ?? '',
    modelId: c.model_id ?? '',
    temperature: c.generation?.temperature != null ? String(c.generation.temperature) : '',
    topP: c.generation?.top_p != null ? String(c.generation.top_p) : '',
    maxTokens: c.generation?.max_tokens != null ? String(c.generation.max_tokens) : '',
    thinking: c.generation?.thinking ?? 'off',
    reasoningEffort: c.generation?.reasoning_effort ?? '',
    unknownMeasure: c.answer_policy?.unknown_measure ?? 'try_anyway',
    grounding: c.answer_policy?.require_grounded_numbers ?? 'off',
    schemaLookup: Boolean(c.answer_policy?.require_schema_lookup),
    requireCitations: c.answer_policy?.require_citations ?? 'off',
    maxAnswerChars:
      c.answer_policy?.max_answer_chars != null ? String(c.answer_policy.max_answer_chars) : '',
    refusalText: c.answer_policy?.refusal?.text ?? '',
    refusalContact: c.answer_policy?.refusal?.contact ?? '',
    pausedMessage: c.answer_policy?.paused_message ?? '',
    maxToolRounds: c.orchestration?.max_tool_rounds
      ? String(c.orchestration.max_tool_rounds)
      : '',
    sandbox: Boolean(c.sandbox?.enabled),
  };
}

/** The part of the configuration this form owns. Anything absent is preserved from the agent. */
export function draftToConfig(d: BehaviourDraft): Omit<KbAgentConfig, 'retrieval'> {
  const rounds = Number.parseInt(d.maxToolRounds, 10);
  const temperature = Number.parseFloat(d.temperature);
  const topP = Number.parseFloat(d.topP);
  const maxTokens = Number.parseInt(d.maxTokens, 10);
  const parsedMaxAnswer = Number.parseInt(d.maxAnswerChars, 10);
  const maxAnswerChars =
    Number.isFinite(parsedMaxAnswer) && parsedMaxAnswer >= 100 ? parsedMaxAnswer : null;
  return {
    model_id: d.modelId.trim() || null,
    generation: {
      temperature:
        Number.isFinite(temperature) ? Math.min(2, Math.max(0, temperature)) : null,
      top_p: Number.isFinite(topP) ? Math.min(1, Math.max(0, topP)) : null,
      // Floor is 1: a ceiling of 0 would ask the model for an empty answer, which is a config error, not a choice.
      max_tokens: Number.isFinite(maxTokens) && maxTokens >= 1 ? Math.min(32_768, maxTokens) : null,
      thinking: d.thinking,
      // Dropped when thinking is off: an effort level with the switch off is a contradiction, and the runtime
      // would ignore it anyway.
      reasoning_effort: d.thinking === 'on' && d.reasoningEffort ? d.reasoningEffort : null,
    },
    prompts: {
      system_prompt: d.systemPrompt.trim() ? d.systemPrompt : null,
      agents_md: d.agentsMd.trim() ? d.agentsMd : null,
    },
    answer_policy: {
      unknown_measure: d.unknownMeasure,
      require_grounded_numbers: d.grounding,
      require_schema_lookup: d.schemaLookup,
      require_citations: d.requireCitations,
      max_answer_chars: maxAnswerChars,
      refusal: { text: d.refusalText.trim() || null, contact: d.refusalContact.trim() || null },
      paused_message: d.pausedMessage.trim() || null,
    },
    orchestration: {
      max_tool_rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null,
    },
    sandbox: { enabled: d.sandbox },
  };
}

/**
 * The draft applied to what the agent already has.
 *
 * The API replaces `agent_config` wholesale and this form draws only some of its keys, so sending the
 * form's object alone would silently clear the rest. Same rule — and the same function — as the knowledge
 * base's own settings: one level of merge, lists replaced, an explicit `null` clears.
 */
export function configFromDraft(
  current: KbAgentConfig | null | undefined,
  d: BehaviourDraft,
  /** Extra groups this form owns but the draft does not model (e.g. the sandbox command list). */
  extra?: Partial<KbAgentConfig>,
): Omit<KbAgentConfig, 'retrieval'> {
  const merged = mergeAgentConfig(current, draftToConfig(d));
  const withExtra = extra ? mergeAgentConfig(merged, extra) : merged;
  const { retrieval: _retrieval, ...rest } = withExtra;
  return rest;
}
