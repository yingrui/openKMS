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
  git_status: 'Git',
  git_add: 'Git',
  git_commit: 'Git',
  git_log: 'Git',
  git_diff: 'Git',
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

function extractCodeFromInput(input: string): string | null {
  try {
    const j = JSON.parse(input) as Record<string, unknown>;
    if (typeof j.code === 'string') return j.code;
  } catch {
    if (!input.trimStart().startsWith('{')) return input;
  }
  return null;
}

function quotedStrings(code: string): string[] {
  return [...code.matchAll(/["']([^"']+)["']/g)].map((m) => m[1] ?? '');
}

function printSummary(code: string): string | null {
  const m = code.match(/print\s*\(\s*f?["']([^"']+)["']/);
  if (!m) return null;
  const msg = m[1].replace(/\{[^}]+\}/g, '').replace(/[:：]\s*$/, '').trim();
  return msg.length >= 2 ? msg : null;
}

function summarizePythonCode(code: string): string {
  const c = code.trim();
  const paths = quotedStrings(c);

  if (/rmtree\s*\(/.test(c)) {
    const target = paths[paths.length - 1];
    const printMsg = printSummary(c);
    if (target && printMsg) return `${printMsg} ${basename(target)}`.trim();
    return target ? `Delete ${basename(target)}` : 'Delete folder';
  }
  if (/\.remove\s*\(|unlink\s*\(/.test(c)) {
    const target = paths[paths.length - 1];
    return target ? `Delete ${basename(target)}` : 'Delete file';
  }
  if (/subprocess\.|os\.system/.test(c)) {
    const cmd = paths[0];
    return cmd ? `Run ${firstLine(cmd, 72)}` : 'Run shell command';
  }
  if (/open\s*\([^)]*["']w/.test(c) || /\.write\s*\(/.test(c)) {
    const target = paths.find((p) => p.includes('.')) ?? paths[paths.length - 1];
    return target ? `Write ${basename(target)}` : 'Write file';
  }
  if (/open\s*\([^)]*["']r/.test(c)) {
    const target = paths[paths.length - 1];
    return target ? `Read ${basename(target)}` : 'Read file';
  }

  const meaningful = c.split('\n').find((line) => {
    const t = line.trim();
    return t && !t.startsWith('import ') && !t.startsWith('from ') && !t.startsWith('#');
  });
  if (meaningful) return firstLine(meaningful.trim(), 72);

  const lines = c.split('\n').filter((l) => l.trim()).length;
  return lines > 1 ? `Run Python script (${lines} lines)` : 'Run Python script';
}

function detailFromObject(name: string, obj: Record<string, unknown>): string {
  if (name === 'run_python' && typeof obj.code === 'string') {
    return summarizePythonCode(obj.code);
  }
  if (name === 'git_commit' && typeof obj.message === 'string') {
    return firstLine(obj.message.trim());
  }
  if (name === 'git_add' && typeof obj.paths === 'string') {
    const paths = obj.paths.trim();
    return paths ? firstLine(paths) : 'Stage all changes';
  }
  if ((name === 'read_file' || name === 'write_file' || name === 'git_diff') && typeof obj.path === 'string') {
    return obj.path;
  }
  for (const key of ['command', 'description', 'prompt', 'task', 'query', 'path']) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return firstLine(v.trim());
  }
  return '';
}

export function toolKindLabel(name: string): string {
  return TOOL_KIND[name] ?? name.replace(/_/g, ' ');
}

export function toolDetailFromInput(name: string, input?: string): string {
  if (!input?.trim()) return '';
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const detail = detailFromObject(name, parsed as Record<string, unknown>);
      if (detail) return detail;
    }
  } catch {
    /* plain text input */
  }
  if (name === 'run_python') {
    return summarizePythonCode(input.trim());
  }
  return firstLine(input.trim());
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
      if (name === 'run_python' && typeof obj.code === 'string') return obj.code;
      if (typeof obj.command === 'string') return obj.command;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.path === 'string') return obj.path;
      return JSON.stringify(obj, null, 2);
    }
  } catch {
    /* plain text */
  }
  return input;
}

export function formatToolOutputForDisplay(_name: string, output?: string): string | undefined {
  if (!output?.trim()) return undefined;
  const trimmed = output.trim();

  const contentMatch = trimmed.match(/^content='((?:[^'\\]|\\.)*)'/);
  if (contentMatch) {
    return contentMatch[1].replace(/\\n/g, '\n').replace(/\\'/g, "'");
  }
  const contentDouble = trimmed.match(/^content="((?:[^"\\]|\\.)*)"/);
  if (contentDouble) {
    return contentDouble[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }

  try {
    const j = JSON.parse(trimmed) as unknown;
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

  if (trimmed.includes("name='") && trimmed.startsWith('content=')) {
    const cut = trimmed.indexOf("' name='");
    if (cut > 8) {
      return trimmed.slice(8, cut).replace(/\\n/g, '\n');
    }
  }

  return output;
}

export function toolUsesCodeIcon(name: string): boolean {
  return name === 'run_python';
}
