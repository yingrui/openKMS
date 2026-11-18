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
  modelId: string;
  unknownMeasure: 'try_anyway' | 'refuse';
  grounding: 'off' | 'mark' | 'enforce';
  schemaLookup: boolean;
  retrieve: 'always' | 'never' | 'on_miss';
  maxToolRounds: string;
  workspace: boolean;
  sandbox: boolean;
}

export function draftFromConfig(cfg: KbAgentConfig | null | undefined): BehaviourDraft {
  const c = cfg ?? {};
  return {
    agentsMd: c.prompts?.agents_md ?? '',
    modelId: c.model_id ?? '',
    unknownMeasure: c.answer_policy?.unknown_measure ?? 'try_anyway',
    grounding: c.answer_policy?.require_grounded_numbers ?? 'off',
    schemaLookup: Boolean(c.answer_policy?.require_schema_lookup),
    retrieve: c.orchestration?.retrieve ?? 'always',
    maxToolRounds: c.orchestration?.max_tool_rounds
      ? String(c.orchestration.max_tool_rounds)
      : '',
    workspace: Boolean(c.workspace?.enabled),
    sandbox: Boolean(c.sandbox?.enabled),
  };
}

/** The part of the configuration this form owns. Anything absent is preserved from the agent. */
export function draftToConfig(d: BehaviourDraft): Omit<KbAgentConfig, 'retrieval'> {
  const rounds = Number.parseInt(d.maxToolRounds, 10);
  return {
    model_id: d.modelId.trim() || null,
    prompts: { agents_md: d.agentsMd.trim() ? d.agentsMd : null },
    answer_policy: {
      unknown_measure: d.unknownMeasure,
      require_grounded_numbers: d.grounding,
      require_schema_lookup: d.schemaLookup,
    },
    orchestration: {
      retrieve: d.retrieve,
      max_tool_rounds: Number.isFinite(rounds) && rounds > 0 ? rounds : null,
    },
    workspace: { enabled: d.workspace },
    sandbox: { enabled: d.sandbox },
  };
}

/**
 * The draft applied to what the agent already has.
 *
 * The API replaces `agent_config` wholesale and this form draws only some of its keys, so sending the
 * form's object alone would silently clear the rest (the Langfuse reference, for one). Same rule — and
 * the same function — as the knowledge base's Agent tab: one level of merge, lists replaced, an
 * explicit `null` clears.
 */
export function configFromDraft(
  current: KbAgentConfig | null | undefined,
  d: BehaviourDraft,
): Omit<KbAgentConfig, 'retrieval'> {
  const merged = mergeAgentConfig(current, draftToConfig(d));
  const { retrieval: _retrieval, ...rest } = merged;
  return rest;
}
