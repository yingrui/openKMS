import { describe, expect, it } from 'vitest';
import {
  availableReferences,
  draftFromSpec,
  emptyDraft,
  newNode,
  specFromDraft,
  unknownReferences,
  type FlowDraft,
} from './logicFlow';

const draft = (over: Partial<FlowDraft> = {}): FlowDraft => ({
  nodes: [{ ...newNode(0), prompt: 'Summarise {{input.email}}' }],
  output: '',
  ...over,
});

describe('draftFromSpec', () => {
  it('round-trips what the editor writes', () => {
    const spec = {
      nodes: [
        {
          id: 'n1',
          kind: 'model',
          prompt: 'Summarise {{input.email}}',
          model_id: 'model_x',
          output_schema: { type: 'object' },
        },
      ],
      output: '{{n1}}',
    };
    const opened = draftFromSpec(spec);
    expect(opened.nodes[0].id).toBe('n1');
    expect(opened.nodes[0].model_id).toBe('model_x');
    expect(JSON.parse(opened.nodes[0].outputSchema)).toEqual({ type: 'object' });
    expect(specFromDraft(opened).spec).toMatchObject({ output: '{{n1}}' });
  });

  it('drops node kinds the editor cannot edit, and never shows an empty list', () => {
    const opened = draftFromSpec({ nodes: [{ id: 'a', kind: 'action' }] });
    expect(opened.nodes).toHaveLength(1);
    expect(opened.nodes[0].prompt).toBe('');
  });

  it('survives a spec that is not a spec', () => {
    expect(draftFromSpec(null).nodes).toHaveLength(1);
    expect(draftFromSpec({ nodes: 'nope' }).nodes).toHaveLength(1);
  });
});

describe('specFromDraft', () => {
  it('builds the spec the backend validates', () => {
    const result = specFromDraft(draft());
    expect(result.errors).toEqual([]);
    expect(result.spec?.nodes[0]).toEqual({
      id: 'n1',
      kind: 'model',
      prompt: 'Summarise {{input.email}}',
    });
  });

  it('reports each problem against the node it belongs to', () => {
    const result = specFromDraft({
      nodes: [
        { ...newNode(0), id: 'n1', prompt: 'ok' },
        { ...newNode(1), id: 'n1', prompt: '' },
      ],
      output: '',
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual(['#2: id "n1" is used twice', '#2: a prompt is required']);
  });

  it('rejects an output schema that is not a JSON object, and a bad token limit', () => {
    const result = specFromDraft({
      nodes: [{ ...newNode(0), prompt: 'ok', outputSchema: '[1,2]', tokenLimit: '0' }],
      output: '',
    });
    expect(result.errors).toEqual([
      '#1: token limit must be a positive integer',
      '#1: output schema must be a JSON object',
    ]);
  });
});

describe('references', () => {
  const nodes = [
    { ...newNode(0), id: 'n1', prompt: '' },
    { ...newNode(1), id: 'n2', prompt: '' },
  ];

  it('offers inputs and only the nodes before this one', () => {
    expect(availableReferences(1, nodes)).toEqual(['input', 'n1']);
    expect(availableReferences(0, nodes)).toEqual(['input']);
  });

  it('flags a reference to a node that runs later', () => {
    expect(unknownReferences('{{n2.answer}} and {{input.q}}', 0, nodes)).toEqual(['n2.answer']);
  });
});

describe('emptyDraft', () => {
  it('starts with one node so the form is never blank', () => {
    expect(emptyDraft().nodes).toHaveLength(1);
  });
});
