import { describe, expect, it } from 'vitest';
import { configFromDraft, draftFromConfig, draftToConfig } from './workforceConfigDraft';

describe('workforce behaviour draft', () => {
  it('never emits retrieval — depth belongs to the knowledge source', () => {
    const config = draftToConfig(draftFromConfig({ retrieval: { top_k: 30 } }));
    expect('retrieval' in config).toBe(false);
  });

  it('reads the agent half and leaves defaults out of the draft', () => {
    const draft = draftFromConfig({
      prompts: { agents_md: 'Cite the clause.' },
      model_id: 'gpt-x',
    });
    expect(draft.agentsMd).toBe('Cite the clause.');
    expect(draft.modelId).toBe('gpt-x');
    expect(draft.unknownMeasure).toBe('try_anyway');
  });

  it('treats an absent config as every default', () => {
    expect(draftFromConfig(null)).toEqual(draftFromConfig({}));
  });

  it('preserves keys the form does not draw', () => {
    const next = configFromDraft(
      { observability: { langfuse_credential_id: 'cred-1', langfuse_tags: ['prod'] } },
      { ...draftFromConfig(null), modelId: 'm1' },
    );
    expect(next.observability?.langfuse_credential_id).toBe('cred-1');
    expect(next.model_id).toBe('m1');
  });

  it('drops a stale retrieval that arrived on the current config', () => {
    const next = configFromDraft({ retrieval: { top_k: 9 } }, draftFromConfig(null));
    expect('retrieval' in next).toBe(false);
  });

  it('drops a tool-round count that cannot be positive', () => {
    const next = draftToConfig({ ...draftFromConfig(null), maxToolRounds: '0' });
    expect(next.orchestration?.max_tool_rounds).toBeNull();
  });
});
