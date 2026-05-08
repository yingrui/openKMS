import i18n from '../i18n/config';

/** FastAPI may return `detail` as string or `{ code, message }` after API internationalization. */
export function parseApiErrorDetail(raw: unknown): { code?: string; message: string } | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return { message: raw };
  if (typeof raw === 'object' && raw !== null && 'message' in raw) {
    const o = raw as { code?: unknown; message?: unknown };
    const message = typeof o.message === 'string' ? o.message : '';
    const code = typeof o.code === 'string' ? o.code : undefined;
    return { code, message };
  }
  return null;
}

/** Prefer server-localized `message`; otherwise resolve by `code` in `apiErrors` namespace. */
export function formatApiErrorMessage(data: unknown): string {
  const root = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : data;
  const parsed = parseApiErrorDetail(root);
  if (!parsed) return i18n.t('genericError', { ns: 'auth' });
  if (parsed.message.trim()) return parsed.message;
  if (parsed.code) {
    const translated = i18n.t(parsed.code, { ns: 'apiErrors', defaultValue: '' });
    if (translated && translated !== parsed.code) return translated;
  }
  return i18n.t('genericError', { ns: 'auth' });
}
