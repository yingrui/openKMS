import type { KbAgentConfig } from '../../data/knowledgeBasesApi';

/**
 * A partial edit applied to the config that is already stored.
 *
 * The API replaces `agent_config` wholesale and a form renders only some of its keys, so sending the form's object on its
 * own silently cleared the rest — enabling code execution in one place and switching it off by pressing Save in another.
 * Both callers need this: the agent's behaviour form, and the knowledge base's retrieval field.
 * One level of merge is enough: every key of the config is a group of scalars, and a group this form does not render
 * (`prompts`, `retrieval`) survives untouched.
 *
 * Lists are replaced, not concatenated (`sandbox.allow_commands` is the value the user is editing), and an explicit
 * `null` in the patch **clears** — that is how the form says "no override".
 */
export function mergeAgentConfig(base: KbAgentConfig | null | undefined, patch: KbAgentConfig): KbAgentConfig {
  const out: KbAgentConfig = { ...(base ?? {}) };
  for (const key of Object.keys(patch) as (keyof KbAgentConfig)[]) {
    const next = patch[key];
    if (next === undefined) continue;
    const prev = out[key];
    const bothGroups =
      prev !== null && next !== null && typeof prev === 'object' && typeof next === 'object' && !Array.isArray(next);
    Object.assign(out, { [key]: bothGroups ? { ...prev, ...next } : next });
  }
  return out;
}
