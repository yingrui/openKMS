import { useEffect, useState } from 'react';
import { authAwareFetch, getAuthHeaders } from '../data/apiClient';

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'crossOrigin'> & {
  src: string;
};

/**
 * <img> that fetches the src with Bearer auth and renders a blob URL.
 * Needed because <img> cannot attach Authorization headers, and our
 * file endpoints (/api/documents/:id/files/...) require a JWT.
 * Passthrough paths (blob:, data:, /examples/*) render directly.
 */
export function AuthImage({ src, onLoad, onError, ...rest }: Props) {
  const [resolved, setResolved] = useState<string>('');

  useEffect(() => {
    if (!src) { setResolved(''); return; }
    if (src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('/examples/')) {
      setResolved(src);
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await authAwareFetch(src, { headers, credentials: 'include' });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolved(objectUrl);
      } catch { /* noop */ }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!resolved) return null;
  return <img src={resolved} onLoad={onLoad} onError={onError} {...rest} />;
}
