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
      { sandbox: { enabled: true, allow_commands: ['ls'] } },
      { ...draftFromConfig(null), modelId: 'm1' },
    );
    expect(next.sandbox?.allow_commands).toEqual(['ls']);
    expect(next.model_id).toBe('m1');
  });

  it('keeps top_p and max_tokens, and treats a ceiling of 0 as unset', () => {
    const next = configFromDraft(null, {
      ...draftFromConfig(null),
      topP: '0.9',
      maxTokens: '0',
    });
    expect(next.generation?.top_p).toBe(0.9);
    // 0 would ask for an empty answer; that is a config error, not a choice, so it stays unset.
    expect(next.generation?.max_tokens).toBeNull();
  });

  it('clamps values above the schema ceiling instead of failing the save', () => {
    const next = configFromDraft(null, {
      ...draftFromConfig(null),
      topP: '2',
      maxTokens: '999999',
    });
    expect(next.generation?.top_p).toBe(1);
    expect(next.generation?.max_tokens).toBe(32768);
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
