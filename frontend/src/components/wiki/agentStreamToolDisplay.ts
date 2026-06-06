/** Human-readable labels for agent tool rows (Cursor-style). */

const TOOL_KIND: Record<string, string> = {
  run_python: 'Python',
  execute: 'Shell',
  bash: 'Shell',
  shell: 'Shell',
  explore: 'Explored',
  read_file: 'Read',
  write_file: 'Write',
  edit_file: 'Edit',
  ls: 'Explored',
  glob: 'Explored',
  grep: 'Explored',
  search_documents: 'Search',
  search_wiki: 'Search',
  search_knowledge_bases: 'Search',
  web_search: 'Search',
  task: 'Subagent',
};

export function shouldHideToolRow(name: string): boolean {
  return name === 'task' || name === 'write_todos';
}

function firstLine(text: string, max = 140): string {
  const line = text.split('\n').find((l) => l.trim()) ?? text;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function basename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function looksLikeProjectRoot(path: string): boolean {
  const p = path.trim();
  return /data\/projects\/[a-f0-9-]+$/i.test(p) || /^[a-f0-9-]{36}$/i.test(basename(p));
}

function extractCodeFromInput(input: string): string | null {
  try {
    const j = JSON.parse(input) as Record<string, unknown>;
    if (typeof j.code === 'string') return j.code;
  } catch {
    if (!input.trimStart().startsWith('{')) return input;
  }
  return null;
}

function legacyGitInputDisplay(name: string, obj: Record<string, unknown>): string | undefined {
  if (name === 'git_status') return 'git status';
  if (name === 'git_log') {
    const limit = typeof obj.limit === 'number' ? obj.limit : 10;
    return `git log -${limit}`;
  }
  if (name === 'git_commit' && typeof obj.message === 'string') return `git commit -m "${obj.message}"`;
  if (name === 'git_add') {
    const paths = typeof obj.paths === 'string' ? obj.paths.trim() : '';
    if (!paths || looksLikeProjectRoot(paths)) return 'git add -A';
    return `git add ${basename(paths)}`;
  }
  if (name === 'git_diff') {
    const path = typeof obj.path === 'string' ? obj.path.trim() : '';
    return path && !looksLikeProjectRoot(path) ? `git diff ${basename(path)}` : 'git diff';
  }
  return undefined;
}

export function toolKindLabel(name: string): string {
  if (name.startsWith('git_')) return 'Shell';
  return TOOL_KIND[name] ?? name.replace(/_/g, ' ');
}

/** Parse delegated subagent task input from stream `subagent_start.name`. */
export function parseSubagentLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'Subagent';
  try {
    const j = JSON.parse(trimmed) as Record<string, unknown>;
    const type = j.subagent_type ?? j.name ?? j.agent;
    const desc = j.description ?? j.prompt ?? j.task;
    const typeStr = typeof type === 'string' ? type : '';
    const descStr = typeof desc === 'string' ? firstLine(desc) : '';
    if (typeStr && descStr) return `${typeStr}: ${descStr}`;
    if (typeStr) return typeStr;
    if (descStr) return descStr;
  } catch {
    /* fall through */
  }
  return firstLine(trimmed);
}

export function unwrapToolMessageContent(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('content=')) return trimmed;

  const quote = trimmed[8];
  if (quote !== "'" && quote !== '"') return trimmed;

  let out = '';
  for (let i = 9; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length) {
      out += trimmed[i + 1];
      i += 1;
      continue;
    }
    if (ch === quote) break;
    out += ch;
  }
  return out.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}

export function formatToolInputForDisplay(name: string, input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  if (name === 'run_python') {
    const code = extractCodeFromInput(input);
    if (code) return code;
  }
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Object.keys(obj).length === 0) return undefined;
      if (name.startsWith('git_')) return legacyGitInputDisplay(name, obj);
      if (name === 'run_python' && typeof obj.code === 'string') return obj.code;
      if (typeof obj.command === 'string') return obj.command;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.path === 'string') return obj.path;
      if (typeof obj.query === 'string') return obj.query;
      return JSON.stringify(obj, null, 2);
    }
  } catch {
    /* plain text */
  }
  return input;
}

export function formatToolOutputForDisplay(_name: string, output?: string): string | undefined {
  if (!output?.trim()) return undefined;
  const content = unwrapToolMessageContent(output.trim());
  if (!content.trim()) return undefined;

  try {
    const j = JSON.parse(content) as unknown;
    if (typeof j === 'string') return j;
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const obj = j as Record<string, unknown>;
      if (typeof obj.content === 'string') return obj.content;
      if (typeof obj.output === 'string') return obj.output;
      if (typeof obj.message === 'string') return obj.message;
    }
  } catch {
    /* plain text */
  }

  return content;
}

export function toolUsesCodeIcon(name: string): boolean {
  return name === 'run_python';
}
