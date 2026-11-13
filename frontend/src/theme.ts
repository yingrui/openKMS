/** Theme source of truth: `data-theme` on <html>, persisted to localStorage. */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'openkms.theme';

export function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode); attribute still applies for this session.
  }
}

/** Apply the persisted theme before first render so there is no light flash. */
export function applyInitialTheme(): void {
  applyTheme(storedTheme() ?? systemTheme());
}
