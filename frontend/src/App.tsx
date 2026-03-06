import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/Layout/MainLayout';
import { Home } from './pages/Home';
import { Documents } from './pages/Documents';
import { Articles } from './pages/Articles';
import { KnowledgeBaseList } from './pages/KnowledgeBaseList';
import { KnowledgeBaseDetail } from './pages/KnowledgeBaseDetail';
import { Pipelines } from './pages/Pipelines';
import { Jobs } from './pages/Jobs';
import { Models } from './pages/Models';
import { DocumentDetail } from './pages/DocumentDetail';
import { ArticleDetail } from './pages/ArticleDetail';
import { ConsoleLayout } from './pages/console/ConsoleLayout';
import { ConsoleOverview } from './pages/console/ConsoleOverview';
import { ConsoleSettings } from './pages/console/ConsoleSettings';
import { ConsoleUsers } from './pages/console/ConsoleUsers';
import { ConsoleFeatureToggles } from './pages/console/ConsoleFeatureToggles';
import { FeatureGate } from './components/FeatureGate';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/view/:id" element={<DocumentDetail />} />
          <Route path="articles" element={<FeatureGate feature="articles"><Articles /></FeatureGate>} />
          <Route path="articles/view/:id" element={<FeatureGate feature="articles"><ArticleDetail /></FeatureGate>} />
          <Route path="knowledge-bases" element={<FeatureGate feature="knowledgeBases"><KnowledgeBaseList /></FeatureGate>} />
          <Route path="knowledge-bases/:id" element={<FeatureGate feature="knowledgeBases"><KnowledgeBaseDetail /></FeatureGate>} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="models" element={<Models />} />
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleOverview />} />
            <Route path="settings" element={<ConsoleSettings />} />
            <Route path="users" element={<ConsoleUsers />} />
            <Route path="feature-toggles" element={<ConsoleFeatureToggles />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
