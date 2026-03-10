import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Cpu, Loader2, Send, Settings, Globe, Clock, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchModelById,
  testModel,
  type ApiModelResponse,
  type ModelTestResponse,
} from '../data/modelsApi';
import './ModelDetail.css';

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
  const { modelId } = useParams<{ modelId: string }>();
  const [model, setModel] = useState<ApiModelResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [maxTokens, setMaxTokens] = useState(512);
  const [temperature, setTemperature] = useState(0.7);
  const [showSettings, setShowSettings] = useState(false);

  // VL form state
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  const [vlResponse, setVlResponse] = useState<{ content: string; elapsed_ms: number } | null>(null);
  const [vlError, setVlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const m = await fetchModelById(modelId);
      setModel(m);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load model');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => { load(); }, [load]);

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
      toast.error('Failed to read image');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearImage = () => {
    setImageDataUri(null);
    setImageFileName(null);
  };

  const handleVLSend = async () => {
    if (!prompt.trim() || !modelId || sending) return;
    setSending(true);
    setVlResponse(null);
    setVlError(null);
    try {
      const res: ModelTestResponse = await testModel(modelId, {
        prompt: prompt.trim(),
        image: imageDataUri || undefined,
        max_tokens: maxTokens,
        temperature,
      });
      if (res.success && res.content) {
        setVlResponse({ content: res.content, elapsed_ms: res.elapsed_ms });
      } else {
        setVlError(res.error || 'Unknown error');
      }
    } catch (e) {
      setVlError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim() || !modelId || sending) return;
    const userMsg = prompt.trim();
    setPrompt('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);

    try {
      const res: ModelTestResponse = await testModel(modelId, {
        prompt: userMsg,
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
          { role: 'error', content: res.error || 'Unknown error', elapsed_ms: res.elapsed_ms },
        ]);
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'error', content: e instanceof Error ? e.message : 'Request failed' },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="model-detail">
        <div className="model-detail-loading">
          <Loader2 size={32} className="model-detail-spinner" />
          <p>Loading model…</p>
        </div>
      </div>
    );
  }

  if (!model) {
    return (
      <div className="model-detail">
        <Link to="/models" className="model-detail-back"><ArrowLeft size={18} /> Back to Models</Link>
        <p className="model-detail-not-found">Model not found.</p>
      </div>
    );
  }

  const isEmbedding = model.category === 'embedding';
  const isVL = model.category === 'vl';
  const isChatModel = model.category === 'llm';

  return (
    <div className="model-detail">
      <Link to="/models" className="model-detail-back">
        <ArrowLeft size={18} />
        <span>Back to Models</span>
      </Link>

      <div className="model-detail-header">
        <div className="model-detail-title-row">
          <Cpu size={24} />
          <div>
            <h1>{model.name}</h1>
            {model.model_name && <span className="model-detail-subtitle">{model.model_name}</span>}
          </div>
        </div>
        <span className="model-detail-category">{model.category}</span>
      </div>

      <div className="model-detail-grid">
        <section className="model-detail-card">
          <h2><Globe size={18} /> Connection</h2>
          <dl className="model-detail-dl">
            <dt>Base URL</dt>
            <dd className="model-detail-mono">{model.base_url}</dd>
            <dt>Provider</dt>
            <dd>{model.provider_name}</dd>
            <dt>API Key</dt>
            <dd>{model.api_key_set ? <span className="model-detail-key-set">Configured (from provider)</span> : <span className="model-detail-key-unset">Not set</span>}</dd>
          </dl>
        </section>

        {model.config && Object.keys(model.config).length > 0 && (
          <section className="model-detail-card">
            <h2><Settings size={18} /> Config</h2>
            <pre className="model-detail-pre">{JSON.stringify(model.config, null, 2)}</pre>
          </section>
        )}

        <section className="model-detail-card">
          <h2><Clock size={18} /> Timestamps</h2>
          <dl className="model-detail-dl">
            <dt>Created</dt>
            <dd>{new Date(model.created_at).toLocaleString()}</dd>
            <dt>Updated</dt>
            <dd>{new Date(model.updated_at).toLocaleString()}</dd>
          </dl>
        </section>
      </div>

      <section className="model-detail-playground">
        <div className="playground-header">
          <h2>Playground</h2>
          {!isEmbedding && (
            <button
              type="button"
              className="playground-settings-toggle"
              onClick={() => setShowSettings((v) => !v)}
              title="Settings"
            >
              <Settings size={16} />
            </button>
          )}
        </div>

        {showSettings && !isEmbedding && (
          <div className="playground-settings">
            <label>
              Max tokens
              <input
                type="number"
                min={1}
                max={4096}
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value) || 512)}
              />
            </label>
            <label>
              Temperature
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
                Input text
                <textarea
                  rows={3}
                  placeholder="Enter text to embed…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={sending}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={!prompt.trim() || sending}
              >
                {sending ? <><Loader2 size={16} className="model-detail-spinner" /> Computing…</> : 'Generate Embedding'}
              </button>
            </div>
            {messages.length > 0 && (
              <div className="playground-embedding-results">
                {messages.filter((m) => m.role !== 'user').map((msg, i) => (
                  <div key={i} className={`playground-embedding-result ${msg.role === 'error' ? 'playground-embedding-error' : ''}`}>
                    <pre className="playground-embedding-output">{msg.content}</pre>
                    {msg.elapsed_ms !== undefined && msg.elapsed_ms > 0 && (
                      <span className="playground-msg-meta">{msg.elapsed_ms}ms</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : isVL ? (
          <div className="playground-vl-form">
            <div className="playground-vl-inputs">
              <div className="playground-vl-image-section">
                <label>Image</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  hidden
                />
                {imageDataUri ? (
                  <div className="playground-vl-image-preview">
                    <img src={imageDataUri} alt="Preview" />
                    <div className="playground-vl-image-actions">
                      <span className="playground-vl-image-name">{imageFileName}</span>
                      <button type="button" onClick={clearImage} title="Remove image"><X size={14} /></button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-sm">Replace</button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="playground-vl-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                  >
                    <ImagePlus size={24} />
                    <span>Click to upload an image</span>
                  </button>
                )}
              </div>
              <div className="playground-vl-prompt-section">
                <label>Prompt</label>
                <textarea
                  rows={4}
                  placeholder="Describe what you want to know about the image…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={sending}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary playground-vl-submit"
                onClick={handleVLSend}
                disabled={!prompt.trim() || sending}
              >
                {sending ? <><Loader2 size={16} className="model-detail-spinner" /> Analyzing…</> : <><Send size={16} /> Analyze</>}
              </button>
            </div>

            {(vlResponse || vlError) && (
              <div className="playground-vl-result">
                <h3>Response {vlResponse?.elapsed_ms ? <span className="playground-msg-meta">{vlResponse.elapsed_ms}ms</span> : null}</h3>
                {vlError ? (
                  <div className="playground-vl-error">{vlError}</div>
                ) : (
                  <div className="playground-vl-markdown">{vlResponse!.content}</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="playground-messages">
              {messages.length === 0 && (
                <div className="playground-empty">
                  {isChatModel
                    ? 'Send a message to test the model. The request uses the OpenAI-compatible chat completions format.'
                    : 'Send input to test the model API endpoint. The request is proxied through the backend.'}
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`playground-msg playground-msg-${msg.role}`}>
                  <div className="playground-msg-role">
                    {msg.role === 'user' ? 'You' : msg.role === 'assistant' ? model.name : 'Error'}
                  </div>
                  <div className="playground-msg-content">
                    {msg.content}
                  </div>
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
                    <span>{isChatModel ? 'Thinking…' : 'Processing…'}</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="playground-input">
              <textarea
                rows={2}
                placeholder={isChatModel
                  ? 'Type a message… (Enter to send, Shift+Enter for new line)'
                  : 'Enter input text… (Enter to send)'}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <button
                type="button"
                className="btn btn-primary playground-send"
                onClick={handleSend}
                disabled={!prompt.trim() || sending}
              >
                {sending ? <Loader2 size={18} className="model-detail-spinner" /> : <Send size={18} />}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
