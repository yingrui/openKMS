import { describe, expect, it } from 'vitest';
import { formatToolDuration, toolDetailLabel, toolKindLabel } from './agentStreamToolDisplay';

const t = (key: string) => `t:${key.split('.').pop()}`;

describe('a tool row reads the same in both vocabularies', () => {
  it('Agent Project tools use the label table, not an English literal', () => {
    // `ls`/`read_file` were hardcoded 'Explored'/'Read', so a Chinese screen mixed languages on one row.
    expect(toolKindLabel('ls', t)).toBe('t:explored');
    expect(toolKindLabel('read_file', t)).toBe('t:read');
    expect(toolKindLabel('task', t)).toBe('t:subagent');
  });

  it('workforce tools use theirs', () => {
    expect(toolKindLabel('search_knowledge_base', t)).toBe('t:knowledgeSearch');
    expect(toolKindLabel('run_cypher', t)).toBe('t:graphQuery');
  });

  it('an unknown tool still shows something readable', () => {
    expect(toolKindLabel('some_new_tool', t)).toBe('some new tool');
  });

  it('the parameter becomes the subtitle', () => {
    expect(toolDetailLabel('read_file', JSON.stringify({ filePath: 'src/app/main.py' }))).toBe('main.py');
    expect(toolDetailLabel('search_knowledge_base', JSON.stringify({ query: 'MIO 等待期' }))).toBe('MIO 等待期');
  });
});

describe('formatToolDuration', () => {
  it('keeps milliseconds under a second and never reports zero', () => {
    expect(formatToolDuration(0.2)).toBe('1ms');
    expect(formatToolDuration(120)).toBe('120ms');
  });
  it('reads in seconds, then minutes', () => {
    expect(formatToolDuration(1240)).toBe('1.2s');
    expect(formatToolDuration(59_400)).toBe('59.4s');
    expect(formatToolDuration(84_000)).toBe('1m24s');
  });
});
