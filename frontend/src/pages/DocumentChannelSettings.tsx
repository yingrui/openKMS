import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { getDocumentChannelName } from '../data/channelUtils';
import { fetchPipelines, type PipelineResponse } from '../data/pipelinesApi';
import { toast } from 'sonner';
import { updateChannel } from '../data/channelsApi';
import './DocumentChannelSettings.css';

export function DocumentChannelSettings() {
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels, refetch: refreshChannels } = useDocumentChannels();

  const [pipelines, setPipelines] = useState<PipelineResponse[]>([]);
  const [pipelinesLoading, setPipelinesLoading] = useState(true);

  const channel = channels.length > 0 ? findChannel(channels, channelId) : null;
  const [pipelineId, setPipelineId] = useState('');
  const [autoProcess, setAutoProcess] = useState(false);
  const [saving, setSaving] = useState(false);

  const channelName = getDocumentChannelName(channels, channelId);

  const loadPipelines = useCallback(async () => {
    setPipelinesLoading(true);
    try {
      const res = await fetchPipelines();
      setPipelines(res.items);
    } catch {
      setPipelines([]);
    } finally {
      setPipelinesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  useEffect(() => {
    if (channel) {
      setPipelineId(channel.pipeline_id || '');
      setAutoProcess(channel.auto_process || false);
    }
  }, [channel]);

  useEffect(() => {
    if (!channelId) navigate('/documents/channels');
  }, [channelId, navigate]);

  if (!channelId) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateChannel(channelId, {
        pipeline_id: pipelineId || null,
        auto_process: autoProcess,
      });
      if (refreshChannels) await refreshChannels();
      toast.success('Channel settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="document-channel-settings">
      <Link to={`/documents/channels/${channelId}`} className="document-channel-settings-back">
        <ArrowLeft size={18} />
        <span>Back to Documents</span>
      </Link>

      <div className="page-header">
        <h1>Channel settings</h1>
        <p className="page-subtitle">
          Configure {channelName} – processing pipeline and auto-process options.
        </p>
      </div>

      <div className="document-channel-settings-form">
        <section className="document-channel-settings-section">
          <h2>Document processing pipeline</h2>
          <div className="document-channel-settings-field">
            <label htmlFor="pipeline">Pipeline</label>
            {pipelinesLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} className="dcs-spinner" />
                <span>Loading pipelines…</span>
              </div>
            ) : (
              <select
                id="pipeline"
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
              >
                <option value="">None</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        <section className="document-channel-settings-section">
          <h2>Auto-process</h2>
          <div className="document-channel-settings-field">
            <label>
              <input
                type="checkbox"
                checked={autoProcess}
                onChange={(e) => setAutoProcess(e.target.checked)}
              />
              <span>Automatically process documents when uploaded to this channel</span>
            </label>
            <p className="document-channel-settings-hint">
              When enabled, a processing job will be created automatically for each uploaded document
              using the selected pipeline.
            </p>
          </div>
        </section>

        <div className="document-channel-settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChannelLike {
  id: string;
  pipeline_id?: string | null;
  auto_process?: boolean;
  children?: ChannelLike[];
}

function findChannel(nodes: ChannelLike[], id: string): ChannelLike | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findChannel(n.children, id);
      if (found) return found;
    }
  }
  return null;
}
