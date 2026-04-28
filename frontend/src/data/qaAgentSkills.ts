/**
 * qa-agent skill catalog for slash-completion in KB Q&A panel.
 * Aligns with qa-agent/qa_agent/skills/ (each module exposes its tools + PROMPT).
 * Behavior is in qa-agent's system prompt; this is UI sugar for users to discover capabilities.
 */
export type QaAgentSkill = {
  id: string;
  label: string;
  description: string;
};

export const QA_AGENT_SKILLS: readonly QaAgentSkill[] = [
  {
    id: 'rag',
    label: 'rag',
    description: '直接基于 PDF 切片回答（默认）。',
  },
  {
    id: 'ontology',
    label: 'ontology',
    description: '本体推理：跑 Cypher 查产品 / 疾病 / 案例 / 通函关联。',
  },
  {
    id: 'page-index',
    label: 'page-index',
    description: '深挖单个 PDF 的特定章节（先看目录再选段落）。',
  },
  {
    id: 'premium',
    label: 'premium',
    description: '保费快速估算：产品 + 年龄 + 性别 + 保额 → 年缴保费。',
  },
  {
    id: 'calculator',
    label: 'calculator',
    description: '保险收益计算器：保费 / 现金价值 / IRR 投影。',
  },
  {
    id: 'compare',
    label: 'compare',
    description: '产品横向对比：2-4 款产品按维度（等待期 / 投保年龄 / 责任 / 现价）拉表。',
  },
];

export function filterQaAgentSkills(q: string): QaAgentSkill[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...QA_AGENT_SKILLS];
  return QA_AGENT_SKILLS.filter(
    (x) =>
      x.id.toLowerCase().includes(s) ||
      x.label.toLowerCase().includes(s) ||
      x.description.toLowerCase().includes(s)
  );
}

/** If cursor is inside a `/name` token at line/token start, return { slashIndex, filter }. */
export function getActiveSlash(
  value: string,
  cursor: number
): { slashIndex: number; filter: string } | null {
  if (cursor < 1) return null;
  const before = value.slice(0, cursor);
  const i = before.lastIndexOf('/');
  if (i < 0) return null;
  if (i > 0) {
    const p = value[i - 1];
    if (p !== ' ' && p !== '\n' && p !== '\r' && p !== '\t') return null;
  }
  const segment = value.slice(i, cursor);
  if (!/^\/[a-zA-Z0-9_-]*$/.test(segment)) return null;
  return { slashIndex: i, filter: segment.slice(1) };
}
