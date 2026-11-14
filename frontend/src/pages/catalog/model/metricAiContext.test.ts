import { describe, expect, it } from 'vitest';
import { aiContextFields, aiContextPayload } from './metricAiContext';

describe('metric ai_context', () => {
  it('keeps only the keys that carry something', () => {
    expect(aiContextPayload('  ', '', '', '')).toBeNull();
    expect(aiContextPayload('0-1', '', ' ', '')).toEqual({ instructions: '0-1' });
  });

  it('splits the lists on both separators and trims', () => {
    expect(aiContextPayload('', '满足率,  达成率，fill rate', '', '')).toEqual({
      synonyms: ['满足率', '达成率', 'fill rate'],
    });
    expect(aiContextPayload('', '', '各方案满足率是多少？· 哪个方案超配？', '')).toEqual({
      examples: ['各方案满足率是多少？', '哪个方案超配？'],
    });
    expect(aiContextPayload('', '', '', '缺口率')).toEqual({ not_for: ['缺口率'] });
  });

  it('round-trips through the form', () => {
    const saved = {
      instructions: '0-1 之间',
      synonyms: ['满足率'],
      examples: ['各方案满足率'],
      not_for: ['缺口率'],
    };
    const fields = aiContextFields(saved);
    expect(fields).toEqual({
      instructions: '0-1 之间',
      synonyms: '满足率',
      examples: '各方案满足率',
      notFor: '缺口率',
    });
    expect(aiContextPayload(fields.instructions, fields.synonyms, fields.examples, fields.notFor)).toEqual(saved);
  });
});
