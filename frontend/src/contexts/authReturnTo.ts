export const SESSION_RETURN_TO = 'openkms:session-return-to';

export function rememberReturnTo(path: string): void {
  if (path.startsWith('/login')) return;
  try {
    sessionStorage.setItem(SESSION_RETURN_TO, path);
  } catch {
    /* storage may be unavailable */
  }
}

export function consumeReturnTo(fallback = '/'): string {
  try {
    const value = sessionStorage.getItem(SESSION_RETURN_TO);
    sessionStorage.removeItem(SESSION_RETURN_TO);
    return value || fallback;
  } catch {
    return fallback;
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(SESSION_RETURN_TO);
  } catch {
    /* ignore */
  }
}
