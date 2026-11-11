import { describe, expect, it } from 'vitest';
import { mergeAgentConfig } from './KbAgentSettings.utils';

/**
 * The Agent tab renders a subset of `agent_config`; saving must not clear what it does not draw. This is the regression test
 * for "I enabled code execution, pressed Save on another section, and it stopped working".
 */
describe('mergeAgentConfig', () => {
  it('keeps a group the form does not render', () => {
    const base = { observability: { langfuse_credential_id: 'cred-1', sample_rate: 0.5 } };
    const merged = mergeAgentConfig(base, { workspace: { enabled: true } });
    expect(merged.observability).toEqual({ langfuse_credential_id: 'cred-1', sample_rate: 0.5 });
    expect(merged.workspace).toEqual({ enabled: true });
  });

  it('keeps fields inside a rendered group that the form does not draw', () => {
    const base = { retrieval: { top_k: 5, rerank: true, min_score: 0.25 } };
    const merged = mergeAgentConfig(base, { retrieval: { top_k: 12 } });
    expect(merged.retrieval).toEqual({ top_k: 12, rerank: true, min_score: 0.25 });
  });

  it('keeps sandbox settings the form only partly covers', () => {
    const base = { sandbox: { enabled: true, memory_mb: 4096, allow_commands: ['git'] } };
    const merged = mergeAgentConfig(base, { sandbox: { enabled: true, timeout_seconds: 120 } });
    expect(merged.sandbox).toEqual({ enabled: true, memory_mb: 4096, allow_commands: ['git'], timeout_seconds: 120 });
  });

  it('replaces lists rather than appending to them', () => {
    const base = { sandbox: { allow_commands: ['git', 'jq'] } };
    expect(mergeAgentConfig(base, { sandbox: { allow_commands: ['sed'] } }).sandbox).toEqual({ allow_commands: ['sed'] });
  });

  it('clears a value the form explicitly empties', () => {
    const base = { prompts: { agents_md: 'old rules' } };
    expect(mergeAgentConfig(base, { prompts: { agents_md: null } }).prompts).toEqual({ agents_md: null });
  });

  it('leaves a key alone when the patch omits it', () => {
    const base = { model_id: 'model-1', workspace: { enabled: false } };
    expect(mergeAgentConfig(base, { workspace: { enabled: true } }).model_id).toBe('model-1');
  });

  it('works with no stored config at all', () => {
    expect(mergeAgentConfig(null, { workspace: { enabled: true } })).toEqual({ workspace: { enabled: true } });
  });
});
