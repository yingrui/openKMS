import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext';
import { DocumentChannelsProvider } from './contexts/DocumentChannelsContext';
import { MainLayout } from './components/Layout/MainLayout';
import { Home } from './pages/Home';
import { DocumentChannel } from './pages/DocumentChannel';
import { DocumentsIndex } from './pages/DocumentsIndex';
import { Articles } from './pages/Articles';
import { KnowledgeBaseList } from './pages/KnowledgeBaseList';
import { KnowledgeBaseDetail } from './pages/KnowledgeBaseDetail';
import { Pipelines } from './pages/Pipelines';
import { Jobs } from './pages/Jobs';
import { JobDetail } from './pages/JobDetail';
import { Models } from './pages/Models';
import { ModelDetail } from './pages/ModelDetail';
import { DocumentDetail } from './pages/DocumentDetail';
import { DocumentChannelSettings } from './pages/DocumentChannelSettings';
import { DocumentChannels } from './pages/DocumentChannels';
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
      <Toaster position="top-right" richColors closeButton />
      <AuthProvider>
      <FeatureTogglesProvider>
      <DocumentChannelsProvider>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="documents" element={<Outlet />}>
            <Route index element={<DocumentsIndex />} />
            <Route path="channels/:channelId/settings" element={<DocumentChannelSettings />} />
            <Route path="channels/:channelId" element={<DocumentChannel />} />
            <Route path="channels" element={<DocumentChannels />} />
            <Route path="view/:id" element={<DocumentDetail />} />
          </Route>
          <Route path="articles" element={<FeatureGate feature="articles"><Articles /></FeatureGate>} />
          <Route path="articles/view/:id" element={<FeatureGate feature="articles"><ArticleDetail /></FeatureGate>} />
          <Route path="knowledge-bases" element={<FeatureGate feature="knowledgeBases"><KnowledgeBaseList /></FeatureGate>} />
          <Route path="knowledge-bases/:id" element={<FeatureGate feature="knowledgeBases"><KnowledgeBaseDetail /></FeatureGate>} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:jobId" element={<JobDetail />} />
          <Route path="models" element={<Models />} />
          <Route path="models/:modelId" element={<ModelDetail />} />
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleOverview />} />
            <Route path="settings" element={<ConsoleSettings />} />
            <Route path="users" element={<ConsoleUsers />} />
            <Route path="feature-toggles" element={<ConsoleFeatureToggles />} />
          </Route>
        </Route>
      </Routes>
      </DocumentChannelsProvider>
      </FeatureTogglesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
