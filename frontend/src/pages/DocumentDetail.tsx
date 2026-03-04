import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Image as ImageIcon, Maximize2, Minimize2, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getDocumentById } from '../data/documents';
import './DocumentDetail.css';

interface ParsingResultItem {
  label: string;
  content: string;
  bbox?: number[];
  image_path?: string;
}

interface LayoutDetItem {
  _images?: { res?: string };
  input_img?: string;
  boxes?: unknown[];
}

interface ParsingResult {
  file_hash: string;
  parsing_res_list: ParsingResultItem[];
  layout_det_res?: LayoutDetItem[];
}

// Map document id to example folder (folder hash + markdown filename)
const documentToFolder: Record<string, { folderId: string; markdownFile: string }> = {
  '1': {
    folderId: 'da4627b85a2d5dec05cc2dcad281a611a5c6f79bcb8fd1ecfa2f34f19b552871',
    markdownFile: 'tmpau_x_tty.md',
  },
  '2': {
    folderId: 'f3b3be345bf2df8979f2491ca9466e078e4fd1d6a216611faa8566e4c44d474b',
    markdownFile: 'tmpp2p37481.md',
  },
};

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [parsingResult, setParsingResult] = useState<ParsingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extendedPanel, setExtendedPanel] = useState<'images' | 'markdown' | null>(null);

  const docConfig = id ? documentToFolder[id] : null;
  const folderId = docConfig?.folderId ?? null;
  const document = id ? getDocumentById(id) : undefined;

  useEffect(() => {
    if (!docConfig) {
      setLoading(false);
      setError('Document is not parsed');
      return;
    }

    const baseUrl = `/examples/${docConfig.folderId}`;
    const markdownUrl = `${baseUrl}/markdown_out/${docConfig.markdownFile}`;

    Promise.all([
      fetch(`${baseUrl}/result.json`).then((r) => (r.ok ? r.json() : null)),
      fetch(markdownUrl).then((r) => (r.ok ? r.text() : null)),
    ])
      .then(([result, md]) => {
        setParsingResult(result);
        setMarkdown(md);
      })
      .catch(() => setError('Failed to load document content'))
      .finally(() => setLoading(false));
  }, [docConfig]);

  const markdownBaseUrl = folderId
    ? `/examples/${folderId}/markdown_out`
    : '';

  return (
    <div className="document-detail">
      <Link to="/documents" className="document-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Documents</span>
      </Link>
      {loading ? (
        <div className="document-detail-loading">Loading...</div>
      ) : (
        <>
          {document && (
            <section className="document-detail-info">
              <h2 className="document-detail-info-title">
                <Info size={20} />
                Document Information
              </h2>
              <dl className={`document-detail-info-list ${parsingResult?.file_hash ? 'document-detail-info-list--with-hash' : ''}`}>
                <div className="document-detail-info-item document-detail-info-item--name">
                  <dt>Name</dt>
                  <dd>{document.name}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>Type</dt>
                  <dd>{document.type}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>Size</dt>
                  <dd>{document.size}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>Uploaded</dt>
                  <dd>{document.uploaded}</dd>
                </div>
                <div className="document-detail-info-item document-detail-info-item--compact">
                  <dt>Markdown</dt>
                  <dd>{markdown ? 'Yes' : 'No'}</dd>
                </div>
                {parsingResult?.file_hash && (
                  <div className="document-detail-info-item document-detail-info-item--compact">
                    <dt>File hash</dt>
                    <dd className="document-detail-info-hash" title={parsingResult.file_hash}>
                      {parsingResult.file_hash.length > 12
                        ? `${parsingResult.file_hash.slice(0, 10)}...`
                        : parsingResult.file_hash}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          {error ? (
            <div className="document-detail-error">{error}</div>
          ) : (
        <div
          className="document-detail-split"
          data-extended-images={extendedPanel === 'images'}
          data-extended-markdown={extendedPanel === 'markdown'}
        >
          <section className="document-detail-panel document-detail-images">
            <h2 className="document-detail-panel-header">
              <ImageIcon size={20} />
              <span>Document Pages</span>
              <button
                type="button"
                className="document-detail-extend-btn"
                onClick={() => setExtendedPanel((p) => (p === 'images' ? null : 'images'))}
                title={extendedPanel === 'images' ? 'Restore split view' : 'Extend to view larger'}
                aria-label={extendedPanel === 'images' ? 'Restore split view' : 'Extend document pages'}
              >
                {extendedPanel === 'images' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </h2>
            <div className="document-detail-images-body">
              {parsingResult?.layout_det_res && parsingResult.layout_det_res.length > 0 ? (
                parsingResult.layout_det_res
                  .filter((item) => item.input_img)
                  .map((item, i) => (
                    <div key={i} className="document-detail-page-item">
                      <span className="document-detail-page-no">Page {i + 1}</span>
                      <img
                        src={`/examples/${item.input_img}`}
                        alt={`Page ${i + 1}`}
                        className="document-detail-layout-img"
                      />
                    </div>
                  ))
              ) : (
                <p className="document-detail-muted">No layout images</p>
              )}
            </div>
          </section>
          <section className="document-detail-panel document-detail-markdown">
            <h2 className="document-detail-panel-header">
              <FileText size={20} />
              <span>Markdown Content</span>
              <button
                type="button"
                className="document-detail-extend-btn"
                onClick={() => setExtendedPanel((p) => (p === 'markdown' ? null : 'markdown'))}
                title={extendedPanel === 'markdown' ? 'Restore split view' : 'Extend to view larger'}
                aria-label={extendedPanel === 'markdown' ? 'Restore split view' : 'Extend markdown content'}
              >
                {extendedPanel === 'markdown' ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </h2>
            <div className="document-detail-markdown-body">
              {markdown ? (
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[rehypeRaw, rehypeKatex]}
                  components={{
                    img: ({ src, ...props }) => (
                      <img
                        src={src?.startsWith('/') ? src : `${markdownBaseUrl}/${src}`}
                        {...props}
                      />
                    ),
                  }}
                >
                  {markdown}
                </ReactMarkdown>
              ) : (
                <p className="document-detail-muted">No markdown content</p>
              )}
            </div>
          </section>
        </div>
          )}
        </>
      )}
    </div>
  );
}
