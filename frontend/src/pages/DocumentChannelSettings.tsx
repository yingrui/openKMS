import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDocumentChannels } from '../contexts/DocumentChannelsContext';
import { getDocumentChannelName } from '../data/channelUtils';
import {
  getDocumentChannelSettings,
  setDocumentChannelSettings,
} from '../data/documentChannelSettings';
import './DocumentChannelSettings.css';

const pipelines = [
  { id: 'p1', name: 'PDF entity extraction' },
  { id: 'p2', name: 'Invoice parser' },
];

export function DocumentChannelSettings() {
  const navigate = useNavigate();
  const { channelId = '' } = useParams<{ channelId: string }>();
  const { channels } = useDocumentChannels();
  const saved = getDocumentChannelSettings(channelId);

  const [pipelineId, setPipelineId] = useState(saved.pipelineId ?? '');
  const [chunkSize, setChunkSize] = useState(saved.chunkSize);
  const [extractTables, setExtractTables] = useState(saved.extractTables);
  const [savedMsg, setSavedMsg] = useState(false);

  const channelName = getDocumentChannelName(channels, channelId);

  useEffect(() => {
    if (!channelId) navigate('/documents/channels');
  }, [channelId, navigate]);

  if (!channelId) return null;

  const handleSave = () => {
    setDocumentChannelSettings({
      channelId,
      pipelineId: pipelineId || null,
      chunkSize,
      extractTables,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
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
          Configure {channelName} – information extraction pipeline and related options.
        </p>
      </div>

      <div className="document-channel-settings-form">
        <section className="document-channel-settings-section">
          <h2>Information extraction pipeline</h2>
          <div className="document-channel-settings-field">
            <label htmlFor="pipeline">Pipeline</label>
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
          </div>
        </section>

        <section className="document-channel-settings-section">
          <h2>Pipeline options</h2>
          <div className="document-channel-settings-field">
            <label htmlFor="chunkSize">Chunk size (tokens)</label>
            <input
              id="chunkSize"
              type="number"
              min={64}
              max={2048}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value) || 512)}
            />
          </div>
          <div className="document-channel-settings-field">
            <label>
              <input
                type="checkbox"
                checked={extractTables}
                onChange={(e) => setExtractTables(e.target.checked)}
              />
              <span>Extract tables</span>
            </label>
          </div>
        </section>

        <div className="document-channel-settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
          {savedMsg && <span className="document-channel-settings-saved">Saved</span>}
        </div>
      </div>
    </div>
  );
}
