import { useEffect, useState } from 'react';

export type DocumentTheme = 'light' | 'dark';

function readTheme(): DocumentTheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

/** Live view of `<html data-theme>` for canvas/editor/iframe consumers. */
export function useDocumentTheme(): DocumentTheme {
  const [theme, setTheme] = useState<DocumentTheme>(readTheme);

  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setTheme(readTheme());
    const observer = new MutationObserver(sync);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
