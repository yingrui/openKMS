import { Plus, Cpu, Search } from 'lucide-react';
import './Models.css';

const modelCategories = [
  { id: 'ocr', name: 'OCR APIs' },
  { id: 'vl', name: 'Vision-Language APIs' },
  { id: 'llm', name: 'LLM APIs' },
  { id: 'embedding', name: 'Embedding APIs' },
  { id: 'text-classification', name: 'Text Classification APIs' },
];

const mockModels = [
  { name: 'bge-m3', provider: 'BAAI', type: 'Embedding', apiKey: '••••••••' },
  { name: 'qwen3', provider: 'Alibaba', type: 'LLM', apiKey: '••••••••' },
  { name: 'PaddleOCR-VL-1.5', provider: 'PaddlePaddle', type: 'Vision-Language', apiKey: '••••••••' },
];

export function Models() {
  return (
    <div className="models">
      <div className="page-header models-header">
        <div>
          <h1>Models</h1>
          <p className="page-subtitle">
            Manage external API providers and inference APIs: OCR, VL, LLM, Embedding, Text Classification, and more.
          </p>
        </div>
        <button type="button" className="btn btn-primary">
          <Plus size={18} />
          <span>Add API</span>
        </button>
      </div>
      <div className="models-main">
        <div className="models-categories">
          <h3>API categories</h3>
          <ul className="models-category-list">
            {modelCategories.map((cat) => (
              <li key={cat.id} className="models-category-item">
                <Cpu size={16} />
                <span>{cat.name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="models-content">
          <div className="models-toolbar">
            <div className="models-search">
              <Search size={18} />
              <input type="search" placeholder="Search models..." />
            </div>
          </div>
          <div className="models-table-wrap">
            <table className="models-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Type</th>
                  <th>API Key</th>
                </tr>
              </thead>
              <tbody>
                {mockModels.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <div className="models-table-name">
                        <Cpu size={18} strokeWidth={1.5} />
                        <span>{m.name}</span>
                      </div>
                    </td>
                    <td>{m.provider}</td>
                    <td>{m.type}</td>
                    <td className="models-table-muted">{m.apiKey}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
