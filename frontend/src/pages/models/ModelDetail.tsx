import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, Loader2, Send, Settings, Globe, Clock, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchModelById,
  testModel,
  type ApiModelResponse,
  type ModelTestResponse,
} from '../../data/modelsApi';
import './ModelDetail.scss';

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
  elapsed_ms?: number;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ModelDetail() {
  const { t } = useTranslation('workspace');
  const { modelId } = useParams<{ modelId: string }>();
  const [model, setModel] = useState<ApiModelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [showSettings, setShowSettings] = useState(false);

  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const m = await fetchModelById(modelId);
      setModel(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('modelDetail.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [modelId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUri = await fileToDataUri(file);
      setImageDataUri(dataUri);
      setImageFileName(file.name);
    } catch {
      toast.error(t('modelDetail.readImageFailed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearImage = () => {
    setImageDataUri(null);
    setImageFileName(null);
  };

  const handleSend = async () => {
    if (!prompt.trim() || !modelId || sending) return;
    const userMsg = prompt.trim();
    const attachImage = imageDataUri || undefined;
    setPrompt('');
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: attachImage ? `${userMsg}\n[${t('modelDetail.imageAttached')}]` : userMsg,
      },
    ]);
    setSending(true);

    try {
      const res: ModelTestResponse = await testModel(modelId, {
        prompt: userMsg,
        image: attachImage,
        max_tokens: maxTokens,
        temperature,
      });

      if (res.success && res.content) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: res.content!, elapsed_ms: res.elapsed_ms },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'error', content: res.error || t('modelDetail.unknownError'), elapsed_ms: res.elapsed_ms },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: e instanceof Error ? e.message : t('modelDetail.requestFailed') },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (loading) {
    return (
      <div className="model-detail">
        <div className="model-detail-loading">
          <Loader2 size={32} className="model-detail-spinner" />
          <p>{t('modelDetail.loading')}</p>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="model-detail">
        <Link to="/models" className="model-detail-back">
          <ArrowLeft size={18} /> {t('modelDetail.back')}
        </Link>
        <p className="model-detail-not-found">{t('modelDetail.notFound')}</p>
      </div>
    );
  }

  const isEmbedding = model.api_kind === 'embeddings';
  const isChatCompletions = model.api_kind === 'chat-completions';
  const hasVision = (model.capabilities || []).includes('vision');

  return (
    <div className="model-detail">
      <Link to="/models" className="model-detail-back">
        <ArrowLeft size={18} />
        <span>{t('modelDetail.back')}</span>
      </Link>

      <div className="model-detail-header">
        <div className="model-detail-title-row">
          <Cpu size={24} />
          <div>
            <h1>{model.name}</h1>
            {model.model_name && <span className="model-detail-subtitle">{model.model_name}</span>}
          </div>
        </div>
        <div className="model-detail-badges">
          <span className="model-detail-api-kind">{model.api_kind}</span>
          {(model.capabilities || []).map((cap) => (
            <span key={cap} className="model-detail-capability">
              {cap}
            </span>
          ))}
        </div>
      </div>

      <div className="model-detail-grid">
        <section className="model-detail-card">
          <h2>
            <Globe size={18} /> {t('modelDetail.connection')}
          </h2>
          <dl className="model-detail-dl">
            <dt>{t('modelDetail.baseUrl')}</dt>
            <dd className="model-detail-mono">{model.base_url}</dd>
            <dt>{t('modelDetail.provider')}</dt>
            <dd>{model.provider_name}</dd>
            <dt>{t('modelDetail.apiKey')}</dt>
            <dd>
              {model.api_key_set ? (
                <span className="model-detail-key-set">{t('shared.configuredFromProvider')}</span>
              ) : (
                <span className="model-detail-key-unset">{t('shared.notSet')}</span>
              )}
            </dd>
          </dl>
        </section>

        {model.config && Object.keys(model.config).length > 0 && (
          <section className="model-detail-card">
            <h2>
              <Settings size={18} /> {t('modelDetail.config')}
            </h2>
            <pre className="model-detail-pre">{JSON.stringify(model.config, null, 2)}</pre>
          </section>
        )}

        <section className="model-detail-card">
          <h2>
            <Clock size={18} /> {t('modelDetail.timestamps')}
          </h2>
          <dl className="model-detail-dl">
            <dt>{t('modelDetail.created')}</dt>
            <dd>{new Date(model.created_at).toLocaleString()}</dd>
            <dt>{t('modelDetail.updated')}</dt>
            <dd>{new Date(model.updated_at).toLocaleString()}</dd>
          </dl>
        </section>
      </div>

      <section className="model-detail-playground">
        <div className="playground-header">
          <h2>{t('modelDetail.playground')}</h2>
          {!isEmbedding && (
            <button
              type="button"
              className="playground-settings-toggle"
              onClick={() => setShowSettings((v) => !v)}
              title={t('modelDetail.settingsTitle')}
            >
              <Settings size={16} />
            </button>
          )}
        </div>

        {showSettings && !isEmbedding && (
          <div className="playground-settings">
            <label>
              {t('modelDetail.maxTokens')}
              <input
                type="number"
                min={1}
                max={4096}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 512)}
              />
            </label>
            <label>
              {t('modelDetail.temperature')}
              <input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value) || 0.7)}
              />
            </label>
          </div>
        )}

        {isEmbedding ? (
          <div className="playground-embedding">
            <div className="playground-embedding-input">
              <label>
                {t('modelDetail.inputText')}
                <textarea
                  rows={3}
                  placeholder={t('modelDetail.embedPlaceholder')}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={sending}
                />
              </label>
              <button type="button" className="btn btn-primary" onClick={() => void handleSend()} disabled={!prompt.trim() || sending}>
                {sending ? (
                  <>
                    <Loader2 size={16} className="model-detail-spinner" /> {t('modelDetail.computing')}
                  </>
                ) : (
                  t('modelDetail.generateEmbedding')
                )}
              </button>
            </div>
            {messages.length > 0 && (
              <div className="playground-embedding-results">
                {messages
                  .filter((m) => m.role !== 'user')
                  .map((msg, i) => (
                    <div
                      key={i}
                      className={`playground-embedding-result ${msg.role === 'error' ? 'playground-embedding-error' : ''}`}
                    >
                      <pre className="playground-embedding-output">{msg.content}</pre>
                      {msg.elapsed_ms !== undefined && msg.elapsed_ms > 0 && (
                        <span className="playground-msg-meta">{msg.elapsed_ms}ms</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="playground-messages">
              {messages.length === 0 && (
                <div className="playground-empty">
                  {isChatCompletions ? t('modelDetail.emptyChatLLM') : t('modelDetail.emptyChatOther')}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`playground-msg playground-msg-${msg.role}`}>
                  <div className="playground-msg-role">
                    {msg.role === 'user'
                      ? t('modelDetail.roleYou')
                      : msg.role === 'assistant'
                        ? model.name
                        : t('modelDetail.roleError')}
                  </div>
                  <div className="playground-msg-content">{msg.content}</div>
                  {msg.elapsed_ms !== undefined && msg.elapsed_ms > 0 && (
                    <div className="playground-msg-meta">{msg.elapsed_ms}ms</div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="playground-msg playground-msg-assistant">
                  <div className="playground-msg-role">{model.name}</div>
                  <div className="playground-msg-content playground-typing">
                    <Loader2 size={16} className="model-detail-spinner" />
                    <span>{isChatCompletions ? t('modelDetail.thinking') : t('modelDetail.processing')}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="playground-composer">
              {hasVision && (
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} hidden />
              )}
              {hasVision && imageDataUri && (
                <div className="playground-image-preview">
                  <img src={imageDataUri} alt={t('modelDetail.previewAlt')} />
                  <div className="playground-image-preview-info">
                    <span className="playground-image-preview-name" title={imageFileName ?? undefined}>
                      {imageFileName}
                    </span>
                    <button
                      type="button"
                      onClick={clearImage}
                      title={t('modelDetail.removeImage')}
                      aria-label={t('modelDetail.removeImage')}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}
              <div className="playground-input">
                {hasVision && (
                  <button
                    type="button"
                    className={`playground-image-btn${imageDataUri ? ' has-image' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    title={t('modelDetail.uploadImage')}
                    aria-label={t('modelDetail.uploadImage')}
                    disabled={sending}
                  >
                    <ImagePlus size={18} />
                  </button>
                )}
                <textarea
                  rows={2}
                  placeholder={
                    hasVision
                      ? t('modelDetail.vlPlaceholder')
                      : isChatCompletions
                        ? t('modelDetail.placeholderChat')
                        : t('modelDetail.placeholderOther')
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="playground-send"
                  onClick={() => void handleSend()}
                  disabled={!prompt.trim() || sending}
                  aria-label={t('modelDetail.send')}
                >
                  {sending ? <Loader2 size={18} className="model-detail-spinner" /> : <Send size={18} />}
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
