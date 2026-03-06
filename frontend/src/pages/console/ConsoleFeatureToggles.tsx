import { useFeatureToggles } from '../../contexts/FeatureTogglesContext';
import './ConsoleFeatureToggles.css';

const features = [
  {
    id: 'articles' as const,
    name: 'Articles',
    description: 'CMS-style articles with content and fields. Lower priority feature.',
  },
  {
    id: 'knowledgeBases' as const,
    name: 'Knowledge Bases',
    description: 'Knowledge bases with RAG Q&A. Lower priority feature.',
  },
];

export function ConsoleFeatureToggles() {
  const { toggles, setToggle } = useFeatureToggles();

  return (
    <div className="console-feature-toggles">
      <div className="page-header">
        <h1>Feature Toggles</h1>
        <p className="page-subtitle">
          Enable or disable features for all users. Disabled features are hidden from the sidebar and navigation.
        </p>
      </div>
      <div className="console-feature-toggles-list">
        {features.map((f) => (
          <div key={f.id} className="console-feature-toggle-item">
            <div className="console-feature-toggle-info">
              <h3>{f.name}</h3>
              <p>{f.description}</p>
            </div>
            <label className="console-feature-toggle-switch">
              <input
                type="checkbox"
                checked={toggles[f.id]}
                onChange={(e) => setToggle(f.id, e.target.checked)}
                aria-label={`Enable ${f.name}`}
              />
              <span className="console-feature-toggle-slider" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
