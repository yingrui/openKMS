import { FileStack, FileText, Database, Search, Layers, Zap, Shield, Network, LogIn } from 'lucide-react';

const painPoints = [
  {
    icon: Search,
    title: 'Knowledge scattered everywhere',
    text: 'Documents, PDFs, and notes live in silos—email, shared drives, wikis—making it hard to find what you need.',
  },
  {
    icon: Layers,
    title: 'No structure for unstructured content',
    text: 'PDFs and images stay as blobs. No way to search, extract, or link content across your organization.',
  },
  {
    icon: Zap,
    title: 'Manual work that should be automated',
    text: 'Repetitive document parsing, layout extraction, and indexing drain time and introduce errors.',
  },
];

const benefits = [
  {
    icon: FileStack,
    title: 'Centralized document hub',
    text: 'Organize everything in channel trees (like Google Drive). Upload PDF, images, HTML—AI parses and converts to searchable Markdown.',
  },
  {
    icon: Database,
    title: 'RAG-ready knowledge bases',
    text: 'Build knowledge bases from your documents. Ask questions and get answers grounded in your own content.',
  },
  {
    icon: Shield,
    title: 'Enterprise-ready security',
    text: 'OIDC SSO or local accounts, fine-grained roles, and a console for permissions, data security, and platform settings.',
  },
];

const functionalities = [
  {
    icon: FileStack,
    title: 'Document management',
    items: [
      'Channel-based organization (tree structure)',
      'Upload PDF, PNG, JPG, WEBP',
      'AI parsing to Markdown (PaddleOCR-VL)',
      'Layout and block detection',
      'S3/MinIO storage',
    ],
  },
  {
    icon: FileText,
    title: 'Articles & content',
    items: ['CMS-style articles', 'Channel tree organization', 'Feature toggles per deployment'],
  },
  {
    icon: Database,
    title: 'Knowledge bases',
    items: [
      'RAG Q&A over your documents',
      'Semantic search over chunks and FAQs (pgvector when configured)',
      'Ask questions in natural language',
    ],
  },
  {
    icon: Network,
    title: 'Ontology & graph',
    items: [
      'Datasets mapped from PostgreSQL data sources',
      'Object types and link types for your domain model',
      'Optional Neo4j indexing and graph exploration',
    ],
  },
  {
    icon: Layers,
    title: 'Pipelines & automation',
    items: [
      'Configurable document pipelines and command templates',
      'Async parsing jobs; per-channel pipeline and auto-process',
      'Models linked to pipelines for OCR / VL / extraction',
    ],
  },
];

export function HomeStaticLanding({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="home home--public">
      <div className="home-landing">
        <section className="home-hero">
          <h1 className="home-hero-title">Open Knowledge Management System</h1>
          <p className="home-hero-subtitle">
            Organize documents in channel trees, parse with AI, and build RAG-ready knowledge bases. One platform for your
            team&apos;s knowledge.
          </p>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">Common Pain Points</h2>
          <p className="home-section-desc">We built openKMS because teams struggle with:</p>
          <div className="home-cards">
            {painPoints.map(({ icon: Icon, title, text }) => (
              <div key={title} className="home-card home-card-pain">
                <div className="home-card-icon">
                  <Icon size={24} strokeWidth={1.75} />
                </div>
                <h3 className="home-card-title">{title}</h3>
                <p className="home-card-text">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">What You Get</h2>
          <p className="home-section-desc">openKMS delivers:</p>
          <div className="home-cards">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div key={title} className="home-card home-card-benefit">
                <div className="home-card-icon">
                  <Icon size={24} strokeWidth={1.75} />
                </div>
                <h3 className="home-card-title">{title}</h3>
                <p className="home-card-text">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">Functionalities</h2>
          <p className="home-section-desc">Key features of the platform:</p>
          <div className="home-func-grid">
            {functionalities.map(({ icon: Icon, title, items }) => (
              <div key={title} className="home-func-card">
                <div className="home-func-header">
                  <Icon size={22} strokeWidth={1.75} />
                  <h3 className="home-func-title">{title}</h3>
                </div>
                <ul className="home-func-list">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="home-cta">
          <p>Ready to organize your knowledge?</p>
          <p className="home-cta-hint">Sign in with your account to use the full application.</p>
          <button type="button" className="btn btn-primary home-static-landing-signin" onClick={onSignIn}>
            <LogIn size={18} />
            <span>Sign in</span>
          </button>
        </section>
      </div>
    </div>
  );
}
