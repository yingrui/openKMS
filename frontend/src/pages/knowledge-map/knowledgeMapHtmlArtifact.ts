/** First index of closing markdown fence after ```html body, or -1. */
export function indexOfClosingHtmlFence(afterOpen: string): number {
  const m = afterOpen.match(/\r?\n```\s*(?:\r?\n|$)/);
  if (m && m.index !== undefined) {
    return m.index;
  }
  const m2 = afterOpen.match(/```\s*(?:\r?\n|$)/);
  if (m2 && m2.index !== undefined && m2.index > 0) {
    return m2.index;
  }
  return -1;
}

/** Extract first markdown ```html … ``` fence (non-greedy close uses same rules as streaming). */
export function extractFirstHtmlFence(text: string): string | null {
  const openRe = /```html\s*/i;
  const mo = text.match(openRe);
  if (!mo || mo.index === undefined) {
    return null;
  }
  const after = text.slice(mo.index + mo[0].length);
  const ci = indexOfClosingHtmlFence(after);
  if (ci < 0) {
    return null;
  }
  const inner = after.slice(0, ci).trimEnd();
  return inner || null;
}

/**
 * Chat thread: show prose before the first ```html fence and prose after the closing ```;
 * omit the fenced HTML body (and fence markers). While the fence is still open, show only the part before ```html.
 */
export function chatDisplayOmitHtmlFenceBody(raw: string): string {
  const openRe = /```html\s*/i;
  const m = raw.match(openRe);
  if (!m || m.index === undefined) {
    return raw.trimEnd();
  }
  const before = raw.slice(0, m.index).trimEnd();
  const afterOpen = raw.slice(m.index + m[0].length);
  const ci = indexOfClosingHtmlFence(afterOpen);
  if (ci < 0) {
    return before;
  }
  const fromClose = afterOpen.slice(ci);
  const delim = fromClose.match(/^(\r?\n```|```)\s*(?:\r?\n|$)/);
  const skip = delim?.[0]?.length ?? 0;
  const after = fromClose.slice(skip).trimStart();
  if (!after) return before;
  if (!before) return after;
  return `${before}\n\n${after}`;
}

/**
 * While the assistant message is still streaming: HTML inside the first ```html … ``` fence.
 * When a closing ``` line is seen, `fenceClosed` is true and `inner` is the complete fenced HTML.
 */
export function extractStreamingHtmlFenceInner(raw: string): {
  inner: string | null;
  fenceOpened: boolean;
  fenceClosed: boolean;
} {
  const openRe = /```html\s*/i;
  const m = raw.match(openRe);
  if (!m || m.index === undefined) {
    return { inner: null, fenceOpened: false, fenceClosed: false };
  }
  const afterOpen = raw.slice(m.index + m[0].length);
  const ci = indexOfClosingHtmlFence(afterOpen);
  if (ci >= 0) {
    const inner = afterOpen.slice(0, ci).trimEnd();
    return { inner: inner || null, fenceOpened: true, fenceClosed: true };
  }
  const inner = afterOpen.trimEnd();
  return { inner: inner || null, fenceOpened: true, fenceClosed: false };
}

/** Extract artifact: first ```html fence, else whole string if it looks like an HTML document. */
export function extractArtifactRaw(text: string): string | null {
  const fenced = extractFirstHtmlFence(text);
  if (fenced) return fenced;
  const t = text.trim();
  if (!t) return null;
  const low = t.slice(0, 64).toLowerCase();
  if (low.startsWith('<!doctype') || low.startsWith('<html')) return t;
  return null;
}
