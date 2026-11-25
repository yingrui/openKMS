import { describe, expect, it } from 'vitest';
import {
  availableReferences,
  draftFromSpec,
  emptyDraft,
  fieldsFromSchema,
  inputNames,
  inputSchemaFromDraft,
  newNode,
  schemaFromFields,
  syncInputs,
  specFromDraft,
  unknownReferences,
  type FlowDraft,
} from './logicFlow';

const draft = (over: Partial<FlowDraft> = {}): FlowDraft => ({
  nodes: [{ ...newNode(0), prompt: 'Summarise {{input.email}}' }],
  inputs: [{ name: 'email', type: 'string', description: '' }],
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
    // `output` is derived now (the last node answers), so it is no longer round-tripped through the form.
    expect(specFromDraft(opened).spec?.nodes[0]).toMatchObject({ output_schema: { type: 'object' } });
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
      inputs: [],
      output: '',
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual(['#2: id "n1" is used twice', '#2: a prompt is required']);
  });

  it('rejects an output schema that is not a JSON object, and a bad token limit', () => {
    const result = specFromDraft({
      nodes: [{ ...newNode(0), prompt: 'ok', outputSchema: '[1,2]', tokenLimit: '0' }],
      inputs: [],
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

describe('inputs follow the prompt', () => {
  it('asks for the variables the prompts mention, not a second declaration', () => {
    const flow = {
      nodes: [
        { ...newNode(0), id: 'n1', prompt: 'Summarise {{input.email}} for {{input.customer}}' },
        { ...newNode(1), id: 'n2', prompt: 'Now use {{n1}} and {{input.email}}' },
      ],
      inputs: [],
      output: '',
    };
    expect(inputNames(flow)).toEqual(['email', 'customer']);
    // The board is filled from the prompts; the schema then comes from the board, with its types and descriptions.
    const synced = syncInputs(flow);
    expect(synced.inputs.map((field) => field.name)).toEqual(['email', 'customer']);
    expect(inputSchemaFromDraft(synced)).toEqual({
      type: 'object',
      properties: { email: { type: 'string' }, customer: { type: 'string' } },
      required: ['email', 'customer'],
    });
  });

  it('has no input schema when nothing is referenced', () => {
    expect(
      inputSchemaFromDraft({ nodes: [{ ...newNode(0), prompt: 'Say hello' }], inputs: [], output: '' }),
    ).toBeNull();
  });
});

describe('structured output', () => {
  it('turns field rows into the schema the model is held to', () => {
    expect(
      schemaFromFields([
        { name: 'summary', type: 'string', description: 'Five words' },
        { name: 'confidence', type: 'number', description: '' },
        { name: 'tags', type: 'string[]', description: '' },
      ]),
    ).toEqual({
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Five words' },
        confidence: { type: 'number' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'confidence', 'tags'],
    });
  });

  it('opens a stored schema as rows, so an agent-written flow is editable', () => {
    expect(
      fieldsFromSchema({ type: 'object', properties: { summary: { type: 'string', description: 'Short' } } }),
    ).toEqual([{ name: 'summary', type: 'string', description: 'Short' }]);
  });

  it('refuses a structured output with no named field', () => {
    const result = specFromDraft({
      nodes: [{ ...newNode(0), prompt: 'ok', outputMode: 'fields' }],
      inputs: [],
      output: '',
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual(['#1: a structured output needs at least one named field']);
  });
});

describe('action nodes', () => {
  it('round-trips an edit node through spec and back', () => {
    const opened = draftFromSpec({
      nodes: [
        { id: 'n1', kind: 'model', prompt: 'Summarise', output_schema: { type: 'object' } },
        { id: 'n2', kind: 'action', action_type: 'addHolding', params: { ts_code: '{{n1.ticker}}' } },
      ],
    });
    expect(opened.nodes[1].kind).toBe('action');
    expect(opened.nodes[1].actionType).toBe('addHolding');
    expect(opened.nodes[1].params).toEqual([{ key: 'ts_code', value: '{{n1.ticker}}' }]);

    const rebuilt = specFromDraft(opened).spec;
    expect(rebuilt?.nodes[1]).toEqual({
      id: 'n2',
      kind: 'action',
      action_type: 'addHolding',
      params: { ts_code: '{{n1.ticker}}' },
    });
  });

  it('needs an action type, and does not ask for a prompt', () => {
    const missing = specFromDraft({
      nodes: [{ ...newNode(0), kind: 'action', actionType: '' }],
      inputs: [],
      output: '',
    });
    expect(missing.errors).toEqual(['#1: an action type is required']);

    const fine = specFromDraft({
      nodes: [{ ...newNode(0), kind: 'action', actionType: 'addHolding' }],
      inputs: [],
      output: '',
    });
    expect(fine.errors).toEqual([]);
  });
});

describe('condition nodes', () => {
  it('round-trips branches, including the fallback', () => {
    const opened = draftFromSpec({
      nodes: [
        { id: 'n1', kind: 'model', prompt: 'pre' },
        {
          id: 'c1',
          kind: 'condition',
          branches: [
            { when: '{{n1.urgent}}', nodes: [{ id: 'a', kind: 'model', prompt: 'fast path' }] },
            { nodes: [{ id: 'b', kind: 'action', action_type: 'addHolding' }] },
          ],
        },
      ],
    });

    expect(opened.nodes[1].kind).toBe('condition');
    expect(opened.nodes[1].branches[0].when).toBe('{{n1.urgent}}');
    expect(opened.nodes[1].branches[1].when).toBe('');
    expect(opened.nodes[1].branches[1].nodes[0].actionType).toBe('addHolding');

    const rebuilt = specFromDraft(opened).spec;
    expect(rebuilt?.nodes[1]).toEqual({
      id: 'c1',
      kind: 'condition',
      branches: [
        { when: '{{n1.urgent}}', nodes: [{ id: 'a', kind: 'model', prompt: 'fast path' }] },
        { nodes: [{ id: 'b', kind: 'action', action_type: 'addHolding', params: {} }] },
      ],
    });
  });

  it('refuses a fallback that is not last', () => {
    const result = specFromDraft({
      nodes: [
        {
          ...newNode(0),
          kind: 'condition',
          branches: [
            { when: '', nodes: [newNode(0)] },
            { when: '{{input.x}}', nodes: [newNode(1)] },
          ],
        },
      ],
      inputs: [],
      output: '',
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toContain('#1: the fallback branch must be last');
  });

  it('drops a nested condition, which the backend would refuse', () => {
    const opened = draftFromSpec({
      nodes: [
        {
          id: 'c1',
          kind: 'condition',
          branches: [
            {
              when: 'x',
              nodes: [{ id: 'c2', kind: 'condition', branches: [{ nodes: [{ id: 'd', kind: 'model', prompt: 'y' }] }] }],
            },
          ],
        },
      ],
    });
    expect(opened.nodes[0].branches[0].nodes).toEqual([]);
  });
});

describe('loop nodes', () => {
  it('round-trips a loop with its element name and concurrency', () => {
    const opened = draftFromSpec({
      nodes: [
        {
          id: 'l1',
          kind: 'loop',
          over: '{{n1.tickers}}',
          as: 'ticker',
          concurrency: 2,
          nodes: [{ id: 'x1', kind: 'model', prompt: 'why {{ticker}}' }],
        },
      ],
    });

    expect(opened.nodes[0].kind).toBe('loop');
    expect(opened.nodes[0].over).toBe('{{n1.tickers}}');
    expect(opened.nodes[0].elementName).toBe('ticker');
    expect(opened.nodes[0].concurrency).toBe('2');
    expect(opened.nodes[0].loopNodes[0].prompt).toBe('why {{ticker}}');

    expect(specFromDraft(opened).spec?.nodes[0]).toEqual({
      id: 'l1',
      kind: 'loop',
      over: '{{n1.tickers}}',
      as: 'ticker',
      concurrency: 2,
      nodes: [{ id: 'x1', kind: 'model', prompt: 'why {{ticker}}' }],
    });
  });

  it('refuses a loop with nothing to iterate or an empty body', () => {
    const result = specFromDraft({
      nodes: [{ ...newNode(0), kind: 'loop', over: '', loopNodes: [] }],
      inputs: [],
      output: '',
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual([
      '#1: a loop needs a list to iterate',
      '#1: a loop needs a body',
    ]);
  });

  it('drops a nested loop, which the backend would refuse', () => {
    const opened = draftFromSpec({
      nodes: [
        {
          id: 'l1',
          kind: 'loop',
          over: '{{n1.items}}',
          nodes: [{ id: 'l2', kind: 'loop', over: '{{x}}', nodes: [] }],
        },
      ],
    });
    expect(opened.nodes[0].loopNodes).toEqual([]);
  });
});
