/** Map git porcelain status codes to short UI labels. */
export function gitStatusLabel(code: string): { short: string; title: string } | null {
  const c = code.trim();
  if (!c) return null;

  const map: Record<string, { short: string; title: string }> = {
    '??': { short: 'U', title: 'Untracked' },
    M: { short: 'M', title: 'Modified' },
    A: { short: 'A', title: 'Added' },
    D: { short: 'D', title: 'Deleted' },
    R: { short: 'R', title: 'Renamed' },
    C: { short: 'C', title: 'Copied' },
    U: { short: 'U', title: 'Unmerged' },
    '!': { short: '!', title: 'Ignored' },
  };

  if (map[c]) return map[c];

  // Two-column porcelain: take the more significant staged/worktree char
  if (c.length === 2) {
    const staged = c[0] !== ' ' && c[0] !== '?' ? c[0] : '';
    const worktree = c[1] !== ' ' && c[1] !== '?' ? c[1] : '';
    const key = staged || worktree;
    if (key && map[key]) return map[key];
    if (c === '??') return map['??'];
  }

  return { short: c.slice(0, 2), title: c };
}
