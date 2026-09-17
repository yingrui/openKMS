import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertCircle } from 'lucide-react';
import { renderAsync } from 'docx-preview';
import { fetchDocumentOriginalBlob } from '../../data/documentsApi';
import './DocumentOriginalPreview.scss';

type PreviewKind = 'docx' | 'html' | 'unsupported';

function kindFor(fileType: string): PreviewKind {
  const t = (fileType || '').toUpperCase().replace(/^\./, '');
  if (t === 'DOCX' || t === 'DOC') return 'docx';
  if (t === 'HTML' || t === 'HTM') return 'html';
  return 'unsupported';
}

/** In-app original-file preview for DOCX (rendered via docx-preview) and HTML (sandboxed iframe). */
export function DocumentOriginalPreview({
  documentId,
  fileHash,
  fileType,
}: {
  documentId: string;
  fileHash: string;
  fileType: string;
}) {
  const { t } = useTranslation('documents');
  const kind = kindFor(fileType);
  const docxHostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [htmlSrc, setHtmlSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setErrorMsg(null);
    setHtmlSrc(null);

    if (kind === 'unsupported') {
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const blob = await fetchDocumentOriginalBlob({ id: documentId, file_hash: fileHash, file_type: fileType });
        if (cancelled) return;
        if (kind === 'docx') {
          const host = docxHostRef.current;
          if (!host) return;
          host.innerHTML = '';
          await renderAsync(blob, host, undefined, {
            className: 'docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            experimental: true,
          });
          if (cancelled) return;
          setStatus('ready');
        } else {
          const text = await blob.text();
          if (cancelled) return;
          setHtmlSrc(text);
          setStatus('ready');
        }
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [documentId, fileHash, fileType, kind]);

  return (
    <div className="doc-original-preview">
      {status === 'loading' && (
        <div className="doc-original-preview__state">
          <Loader2 size={18} className="doc-original-preview__spin" />
          <span>{t('originalPreview.loading', '正在加载原件…')}</span>
        </div>
      )}
      {status === 'error' && (
        <div className="doc-original-preview__state doc-original-preview__state--error">
          <AlertCircle size={18} />
          <span>
            {kind === 'unsupported'
              ? t('originalPreview.unsupported', '该文件类型暂不支持原件预览')
              : t('originalPreview.failed', '原件加载失败')}
            {errorMsg ? ` · ${errorMsg}` : ''}
          </span>
        </div>
      )}
      {/* docx host stays mounted so renderAsync can target it */}
      <div
        ref={docxHostRef}
        className="doc-original-preview__docx"
        style={{ display: kind === 'docx' && status === 'ready' ? 'block' : 'none' }}
      />
      {kind === 'html' && status === 'ready' && htmlSrc != null && (
        <iframe
          className="doc-original-preview__html"
          title={t('originalPreview.htmlTitle', 'HTML 原件')}
          sandbox=""
          srcDoc={htmlSrc}
        />
      )}
    </div>
  );
}
