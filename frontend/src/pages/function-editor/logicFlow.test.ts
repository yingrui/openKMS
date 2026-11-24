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
  specFromDraft,
  unknownReferences,
  type FlowDraft,
} from './logicFlow';

const draft = (over: Partial<FlowDraft> = {}): FlowDraft => ({
  nodes: [{ ...newNode(0), prompt: 'Summarise {{input.email}}' }],
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
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual(['#2: id "n1" is used twice', '#2: a prompt is required']);
  });

  it('rejects an output schema that is not a JSON object, and a bad token limit', () => {
    const result = specFromDraft({
      nodes: [{ ...newNode(0), prompt: 'ok', outputSchema: '[1,2]', tokenLimit: '0' }],
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
    const draft = {
      nodes: [
        { ...newNode(0), id: 'n1', prompt: 'Summarise {{input.email}} for {{input.customer}}' },
        { ...newNode(1), id: 'n2', prompt: 'Now use {{n1}} and {{input.email}}' },
      ],
    };
    expect(inputNames(draft)).toEqual(['email', 'customer']);
    expect(inputSchemaFromDraft(draft)).toEqual({
      type: 'object',
      properties: { email: { type: 'string' }, customer: { type: 'string' } },
      required: ['email', 'customer'],
    });
  });

  it('has no input schema when nothing is referenced', () => {
    expect(inputSchemaFromDraft({ nodes: [{ ...newNode(0), prompt: 'Say hello' }] })).toBeNull();
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
    });
    expect(result.spec).toBeNull();
    expect(result.errors).toEqual(['#1: a structured output needs at least one named field']);
  });
});
