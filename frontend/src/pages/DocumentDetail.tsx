import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
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

  const docConfig = id ? documentToFolder[id] : null;
  const folderId = docConfig?.folderId ?? null;

  useEffect(() => {
    if (!docConfig) {
      setLoading(false);
      setError('No example content for this document');
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
      ) : error ? (
        <div className="document-detail-error">{error}</div>
      ) : (
        <div className="document-detail-split">
          <section className="document-detail-panel document-detail-images">
            <h2>
              <ImageIcon size={20} />
              Document Pages
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
            <h2>
              <FileText size={20} />
              Markdown Content
            </h2>
            <div className="document-detail-markdown-body">
              {markdown ? (
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
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
    </div>
  );
}
