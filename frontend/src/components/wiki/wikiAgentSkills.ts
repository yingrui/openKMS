/**
 * Vendored wiki-skills (kfchou/wiki-skills) names, for slash completion in Wiki Copilot.
 * Aligns with third-party/wiki-skills (each skills subfolder). Behavior is in the system prompt; this is UI sugar.
 */
export type WikiAgentSkill = {
  id: string;
  label: string;
  description: string;
};

export const WIKI_AGENT_SKILLS: readonly WikiAgentSkill[] = [
  {
    id: 'wiki-init',
    label: 'wiki-init',
    description: 'Bootstrap / structure a wiki (on openKMS: use UI & DB, not local folders).',
  },
  {
    id: 'wiki-ingest',
    label: 'wiki-ingest',
    description: 'Ingest a source into the wiki (on openKMS: import or describe sources).',
  },
  {
    id: 'wiki-query',
    label: 'wiki-query',
    description: 'Ask using the wiki as the source of truth; tools read real pages.',
  },
  {
    id: 'wiki-lint',
    label: 'wiki-lint',
    description: 'Health audit: links, coverage, consistency (analyse with available tools).',
  },
  {
    id: 'wiki-update',
    label: 'wiki-update',
    description: 'Revise or sync pages when knowledge changes (edits: UI/CLI in openKMS).',
  },
] as const;

export function filterWikiAgentSkills(q: string): WikiAgentSkill[] {
  const s = q.trim().toLowerCase();
  if (!s) return [...WIKI_AGENT_SKILLS];
  return WIKI_AGENT_SKILLS.filter(
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
