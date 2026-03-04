import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { getArticleDetail } from '../data/articles';
import './ArticleDetail.css';

export function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const [infoVisible, setInfoVisible] = useState(true);

  const article = id ? getArticleDetail(id) : undefined;

  return (
    <div className="article-detail">
      <Link to="/articles" className="article-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Articles</span>
      </Link>
      {!article ? (
        <div className="article-detail-error">Article not found</div>
      ) : (
        <>
          <section className={`article-detail-info ${infoVisible ? '' : 'article-detail-info--collapsed'}`}>
            <h2
              className="article-detail-info-title article-detail-info-toggle"
              onClick={() => setInfoVisible((v) => !v)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setInfoVisible((v) => !v)}
              aria-expanded={infoVisible}
            >
              <Info size={20} />
              <span>Article Information</span>
              <button
                type="button"
                className="article-detail-info-toggle-btn"
                onClick={(e) => { e.stopPropagation(); setInfoVisible((v) => !v); }}
                aria-label={infoVisible ? 'Hide article information' : 'Show article information'}
              >
                {infoVisible ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </h2>
            {infoVisible && (
            <dl className="article-detail-info-list">
              <div className="article-detail-info-item article-detail-info-item--name">
                <dt>Title</dt>
                <dd>{article.title}</dd>
              </div>
              <div className="article-detail-info-item article-detail-info-item--compact">
                <dt>Slug</dt>
                <dd>{article.slug}</dd>
              </div>
              <div className="article-detail-info-item article-detail-info-item--compact">
                <dt>Author</dt>
                <dd>{article.author}</dd>
              </div>
              <div className="article-detail-info-item article-detail-info-item--compact">
                <dt>Status</dt>
                <dd>{article.status}</dd>
              </div>
              <div className="article-detail-info-item article-detail-info-item--compact">
                <dt>Updated</dt>
                <dd>{article.updated}</dd>
              </div>
              {article.fields.category && (
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Category</dt>
                  <dd>{article.fields.category}</dd>
                </div>
              )}
              {article.fields.tags && (
                <div className="article-detail-info-item article-detail-info-item--compact">
                  <dt>Tags</dt>
                  <dd>{article.fields.tags}</dd>
                </div>
              )}
            </dl>
            )}
          </section>
          <section className="article-detail-content">
            <h2 className="article-detail-content-title">Content</h2>
            <div className="article-detail-content-body">
              {article.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {article.content}
                </ReactMarkdown>
              ) : (
                <p className="article-detail-muted">No content</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
