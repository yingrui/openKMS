import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useEnsureMediaChannels } from '../../contexts/MediaChannelsContext';
import { updateMediaChannel } from '../../data/mediaChannelsApi';
import { flattenChannels } from '../../data/channelUtils';
import '../documents/DocumentChannelSettings.scss';

export function MediaChannelSettings() {
  const { t } = useTranslation('media');
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, refetch } = useEnsureMediaChannels();
  const channel = flattenChannels(channels).find((c) => c.id === channelId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metadataSchemaText, setMetadataSchemaText] = useState('[]');
  const [defaultImageModelId, setDefaultImageModelId] = useState('');
  const [defaultVideoModelId, setDefaultVideoModelId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setDescription(channel.description || '');
    setMetadataSchemaText(JSON.stringify(channel.metadata_schema || [], null, 2));
    setDefaultImageModelId(channel.default_image_model_id || '');
    setDefaultVideoModelId(channel.default_video_model_id || '');
  }, [channel]);

  if (!channel) {
    return <p>Collection not found</p>;
  }

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let metadata_schema = null;
      try {
        metadata_schema = JSON.parse(metadataSchemaText);
      } catch {
        toast.error('Invalid metadata schema JSON');
        setSaving(false);
        return;
      }
      await updateMediaChannel(channelId, {
        name: name.trim(),
        description: description.trim() || null,
        metadata_schema,
        default_image_model_id: defaultImageModelId.trim() || null,
        default_video_model_id: defaultVideoModelId.trim() || null,
      });
      await refetch();
      toast.success(t('settings.saved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="document-channel-settings">
      <Link to={`/media/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} /> {channel.name}
      </Link>
      <h1>{t('settings.title')}</h1>
      <form onSubmit={onSave}>
        <label>{t('channels.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
        <label>{t('channels.description')}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <label>{t('settings.metadataSchema')}</label>
        <textarea value={metadataSchemaText} onChange={(e) => setMetadataSchemaText(e.target.value)} rows={8} />
        <label>{t('settings.defaultImageModel')}</label>
        <input value={defaultImageModelId} onChange={(e) => setDefaultImageModelId(e.target.value)} />
        <label>{t('settings.defaultVideoModel')}</label>
        <input value={defaultVideoModelId} onChange={(e) => setDefaultVideoModelId(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{t('detail.save')}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(`/media/channels/${channelId}`)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
