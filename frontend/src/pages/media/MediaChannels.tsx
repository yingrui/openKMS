import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus } from 'lucide-react';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { createMediaChannel } from '../../data/mediaChannelsApi';
import { flattenChannels } from '../../data/channelUtils';
import '../documents/DocumentChannels.scss';

export function MediaChannels() {
  const { t } = useTranslation('media');
  const { channels, loading, error, refetch } = useEnsureMediaChannels();
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const flat = flattenChannels(channels);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      await createMediaChannel({ name, description: createDescription.trim() || null });
      setCreateName('');
      setCreateDescription('');
      await refetch();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('channels.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="document-channels">
      <Link to="/media" className="document-channels-back">
        <ArrowLeft size={18} />
        <span>{t('channels.backToMedia')}</span>
      </Link>
      <div className="page-header">
        <h1>{t('channels.pageTitle')}</h1>
        <p className="page-subtitle">{t('channels.pageSubtitle')}</p>
      </div>
      {(error || createError) && <div className="document-channels-error" role="alert">{createError || error}</div>}
      <div className="document-channels-layout">
        <section className="document-channels-create">
          <h2><Plus size={20} />{t('channels.newChannel')}</h2>
          <form onSubmit={handleCreate} className="document-channels-form">
            <div className="document-channels-field">
              <label htmlFor="mc-name">{t('channels.name')}</label>
              <input id="mc-name" value={createName} onChange={(e) => setCreateName(e.target.value)} required />
            </div>
            <div className="document-channels-field">
              <label htmlFor="mc-desc">{t('channels.description')}</label>
              <textarea id="mc-desc" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={2} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={creating}>{t('channels.create')}</button>
          </form>
        </section>
        <section className="document-channels-list">
          <h2>{t('channels.pageTitle')}</h2>
          {loading ? <p>…</p> : (
            <ul>
              {flat.map((c) => (
                <li key={c.id}>
                  <Link to={`/media/channels/${c.id}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
