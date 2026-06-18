import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare } from 'lucide-react';
import { CommentRankStars } from '../comments/CommentRankStars';
import type { HomeHubCommentItem } from '../../data/homeHubApi';
import './HomeCommentFeed.scss';

function commentResourcePath(resourceType: string, resourceId: string): string {
  switch (resourceType) {
    case 'article':
      return `/articles/view/${resourceId}`;
    case 'document':
      return `/documents/view/${resourceId}`;
    case 'knowledge_base':
      return `/knowledge-bases/${resourceId}`;
    case 'wiki_space':
      return `/wikis/${resourceId}/pages/graph`;
    case 'project':
      return `/projects/${resourceId}`;
    default:
      return '/';
  }
}

function resourceTypeLabel(resourceType: string, t: (key: string) => string): string {
  switch (resourceType) {
    case 'article':
      return t('commentResourceArticle');
    case 'document':
      return t('commentResourceDocument');
    case 'knowledge_base':
      return t('commentResourceKnowledgeBase');
    case 'wiki_space':
      return t('commentResourceWikiSpace');
    case 'project':
      return t('commentResourceProject');
    default:
      return resourceType;
  }
}

function formatWhen(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function HomeCommentFeed({ items }: { items: HomeHubCommentItem[] }) {
  const { t, i18n } = useTranslation('home');

  return (
    <section className="home-hub-card home-hub-card--comments">
      <h2 className="home-hub-card-title">
        <MessageSquare size={20} aria-hidden />
        {t('recentComments')}
      </h2>
      <p className="home-muted home-hub-card-intro">{t('recentCommentsIntro')}</p>
      {!items.length ? (
        <p className="home-muted">{t('recentCommentsEmpty')}</p>
      ) : (
        <ul className="home-comment-feed">
          {items.map((c) => {
            const author = c.created_by_name?.trim() || c.created_by;
            const href = commentResourcePath(c.resource_type, c.resource_id);
            return (
              <li key={c.id} className="home-comment-feed-item">
                <div className="home-comment-feed-meta">
                  <span className="home-comment-feed-type">
                    {resourceTypeLabel(c.resource_type, t)}
                  </span>
                  <Link to={href} className="home-comment-feed-resource">
                    {c.resource_title}
                  </Link>
                  <span className="home-comment-feed-when">{formatWhen(c.created_at, i18n.language)}</span>
                </div>
                <div className="home-comment-feed-body-row">
                  <p className="home-comment-feed-body">
                    {c.is_reply ? (
                      <span className="home-comment-feed-reply-tag">{t('commentReply')}</span>
                    ) : null}
                    <span className="home-comment-feed-author">{author}</span>
                    {': '}
                    {c.body}
                  </p>
                  {!c.is_reply && c.rank != null && c.rank > 0 ? (
                    <CommentRankStars value={c.rank} readonly size={12} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
