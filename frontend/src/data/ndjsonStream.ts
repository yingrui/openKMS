/** Read newline-delimited JSON from a fetch response body. */

export async function readNdjsonStream<T>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: T) => void,
  options?: { signal?: AbortSignal; parseLine?: (line: string) => T },
): Promise<void> {
  const parseLine =
    options?.parseLine ??
    ((line: string) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error('Stream contained invalid JSON');
      }
    });

  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    if (options?.signal?.aborted) {
      await reader.cancel();
      throw new DOMException('Aborted', 'AbortError');
    }
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      onEvent(parseLine(line));
    }
  }
  const rest = buf.trim();
  if (rest) {
    onEvent(parseLine(rest));
  }
}
