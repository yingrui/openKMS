import { describe, expect, it, vi } from 'vitest';
import { RUN_REQUEST_KEYS, RunRequestError, buildRunRequest } from './runRequest';

/**
 * The request that leaves the page, checked here rather than discovered in the job arguments.
 *
 * The bug this file exists for: `runEvaluation` serialised `evaluation_type` and dropped everything else, so a dialog
 * that said "only the seven that failed" asked for the whole set and the run came back with seventeen results.
 */
describe('buildRunRequest', () => {
  const base = {
    evaluationType: 'data_query',
    judgeModelId: 'model-1',
    language: 'zh' as const,
    failedItemIds: ['a', 'b', 'c'],
  };

  it('sends the ids when a subset is meant', () => {
    expect(buildRunRequest({ ...base, scope: 'failed' })).toEqual({
      evaluation_type: 'data_query',
      item_scope: 'subset',
      item_ids: ['a', 'b', 'c'],
      judge_model_id: 'model-1',
      language: 'zh',
    });
  });

  it('says "all" and sends no ids when everything is meant', () => {
    expect(buildRunRequest({ ...base, scope: 'all' })).toEqual({
      evaluation_type: 'data_query',
      item_scope: 'all',
      item_ids: null,
      judge_model_id: 'model-1',
      language: 'zh',
    });
  });

  it('refuses a subset with nothing in it instead of widening to everything', () => {
    expect(() => buildRunRequest({ ...base, scope: 'failed', failedItemIds: [] })).toThrow(RunRequestError);
  });

  it('refuses an empty id', () => {
    expect(() => buildRunRequest({ ...base, scope: 'failed', failedItemIds: ['a', ' '] })).toThrow(RunRequestError);
  });

  it('refuses a request with no evaluation type', () => {
    expect(() => buildRunRequest({ ...base, scope: 'all', evaluationType: '' })).toThrow(RunRequestError);
  });

  it('names exactly the fields the API accepts', () => {
    expect(Object.keys(buildRunRequest({ ...base, scope: 'all' })).sort()).toEqual([...RUN_REQUEST_KEYS].sort());
  });
});

describe('runEvaluation', () => {
  it('serialises every field it is given', async () => {
    const send = vi.fn().mockResolvedValue({ run_id: 'r', status: 'running' });
    vi.doMock('../../data/apiClient', () => ({
      request: send,
      requestBlob: vi.fn(),
      requestRaw: vi.fn(),
    }));
    const { runEvaluation } = await import('../../data/evaluationsApi');
    await runEvaluation('ev-1', {
      evaluation_type: 'data_query',
      item_scope: 'subset',
      item_ids: ['a', 'b'],
      judge_model_id: 'model-1',
      language: 'zh',
    });
    const body = JSON.parse(send.mock.calls[0][1].body as string);
    expect(body).toEqual({
      evaluation_type: 'data_query',
      item_scope: 'subset',
      item_ids: ['a', 'b'],
      judge_model_id: 'model-1',
      language: 'zh',
    });
  });
});
