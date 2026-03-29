import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useParams } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext';
import { DocumentChannelsProvider } from './contexts/DocumentChannelsContext';
import { MainLayout } from './components/Layout/MainLayout';
import { Home } from './pages/Home';
import { Profile } from './pages/Profile';
import { Login } from './pages/Login';
import { OidcCallback } from './pages/OidcCallback';
import { OidcSilentRenew } from './pages/OidcSilentRenew';
import { Signup } from './pages/Signup';
import { DocumentChannel } from './pages/DocumentChannel';
import { DocumentsIndex } from './pages/DocumentsIndex';
import { Articles } from './pages/Articles';
import { KnowledgeBaseList } from './pages/KnowledgeBaseList';
import { GlossaryList } from './pages/GlossaryList';
import { GlossaryDetail } from './pages/GlossaryDetail';
import { DocumentChannels } from './pages/DocumentChannels';
import { ConsoleLayout } from './pages/console/ConsoleLayout';
import { ConsoleOverview } from './pages/console/ConsoleOverview';
import { ConsoleSettings } from './pages/console/ConsoleSettings';
import { ConsoleUsers } from './pages/console/ConsoleUsers';
import { ConsoleFeatureToggles } from './pages/console/ConsoleFeatureToggles';
import { ConsoleObjectTypes } from './pages/console/ConsoleObjectTypes';
import { ConsoleLinkTypes } from './pages/console/ConsoleLinkTypes';
import { ConsoleDataSources } from './pages/console/ConsoleDataSources';
import { ConsoleDatasets } from './pages/console/ConsoleDatasets';
import { EvaluationDatasetList } from './pages/EvaluationDatasetList';
import { EvaluationDatasetDetail } from './pages/EvaluationDatasetDetail';
import { FeatureGate } from './components/FeatureGate';
import { ErrorBoundary } from './components/ErrorBoundary';

const KnowledgeBaseDetail = lazy(() => import('./pages/KnowledgeBaseDetail').then((m) => ({ default: m.KnowledgeBaseDetail })));
const Pipelines = lazy(() => import('./pages/Pipelines').then((m) => ({ default: m.Pipelines })));
const Jobs = lazy(() => import('./pages/Jobs').then((m) => ({ default: m.Jobs })));
const JobDetail = lazy(() => import('./pages/JobDetail').then((m) => ({ default: m.JobDetail })));
const Models = lazy(() => import('./pages/Models').then((m) => ({ default: m.Models })));
const ModelDetail = lazy(() => import('./pages/ModelDetail').then((m) => ({ default: m.ModelDetail })));
const OntologyList = lazy(() => import('./pages/OntologyList').then((m) => ({ default: m.OntologyList })));
const ObjectsList = lazy(() => import('./pages/ObjectsList').then((m) => ({ default: m.ObjectsList })));
const ObjectTypeDetail = lazy(() => import('./pages/ObjectTypeDetail').then((m) => ({ default: m.ObjectTypeDetail })));
const LinksList = lazy(() => import('./pages/LinksList').then((m) => ({ default: m.LinksList })));
const LinkTypeDetail = lazy(() => import('./pages/LinkTypeDetail').then((m) => ({ default: m.LinkTypeDetail })));
const ObjectExplorer = lazy(() => import('./pages/ObjectExplorer').then((m) => ({ default: m.ObjectExplorer })));
const DocumentDetail = lazy(() => import('./pages/DocumentDetail').then((m) => ({ default: m.DocumentDetail })));
const DocumentChannelSettings = lazy(() => import('./pages/DocumentChannelSettings').then((m) => ({ default: m.DocumentChannelSettings })));
const ArticleDetail = lazy(() => import('./pages/ArticleDetail').then((m) => ({ default: m.ArticleDetail })));
const ConsoleDatasetDetail = lazy(() => import('./pages/console/ConsoleDatasetDetail').then((m) => ({ default: m.ConsoleDatasetDetail })));

function EvaluationDatasetDetailPage() {
  const { id } = useParams();
  return <EvaluationDatasetDetail key={id ?? ''} />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <AuthProvider>
      <FeatureTogglesProvider>
      <DocumentChannelsProvider>
      <ErrorBoundary>
      <Suspense fallback={<div className="app-loading" aria-live="polite">Loading...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<OidcCallback />} />
        <Route path="/auth/silent-renew" element={<OidcSilentRenew />} />
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
          <Route path="evaluation-datasets" element={<FeatureGate feature="evaluationDatasets"><EvaluationDatasetList /></FeatureGate>} />
          <Route path="evaluation-datasets/:id" element={<FeatureGate feature="evaluationDatasets"><EvaluationDatasetDetailPage /></FeatureGate>} />
          <Route path="glossaries" element={<GlossaryList />} />
          <Route path="glossaries/:id" element={<GlossaryDetail />} />
          <Route path="profile" element={<Profile />} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:jobId" element={<JobDetail />} />
          <Route path="models" element={<Models />} />
          <Route path="models/:modelId" element={<ModelDetail />} />
          <Route path="ontology" element={<FeatureGate feature="objectsAndLinks"><OntologyList /></FeatureGate>} />
          <Route path="objects" element={<FeatureGate feature="objectsAndLinks"><ObjectsList /></FeatureGate>} />
          <Route path="objects/:typeId" element={<FeatureGate feature="objectsAndLinks"><ObjectTypeDetail /></FeatureGate>} />
          <Route path="links" element={<FeatureGate feature="objectsAndLinks"><LinksList /></FeatureGate>} />
          <Route path="links/:typeId" element={<FeatureGate feature="objectsAndLinks"><LinkTypeDetail /></FeatureGate>} />
          <Route path="object-explorer" element={<FeatureGate feature="objectsAndLinks"><ObjectExplorer /></FeatureGate>} />
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleOverview />} />
            <Route path="object-types" element={<ConsoleObjectTypes />} />
            <Route path="link-types" element={<ConsoleLinkTypes />} />
            <Route path="data-sources" element={<ConsoleDataSources />} />
            <Route path="datasets" element={<ConsoleDatasets />} />
            <Route path="datasets/:id" element={<ConsoleDatasetDetail />} />
            <Route path="settings" element={<ConsoleSettings />} />
            <Route path="users" element={<ConsoleUsers />} />
            <Route path="feature-toggles" element={<ConsoleFeatureToggles />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </DocumentChannelsProvider>
      </FeatureTogglesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
