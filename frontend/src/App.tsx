import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useParams, Navigate, useLocation } from 'react-router-dom';
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
import { WikiSpaceList } from './pages/WikiSpaceList';
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
import { ConsolePermissionManagement } from './pages/console/ConsolePermissionManagement';
import { ConsoleDataSecurityGroups } from './pages/console/ConsoleDataSecurityGroups';
import { ConsoleGroupDataAccess } from './pages/console/ConsoleGroupDataAccess';
import { ConsoleDataResources } from './pages/console/ConsoleDataResources';
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
const WikiSpaceDetail = lazy(() => import('./pages/WikiSpaceDetail').then((m) => ({ default: m.WikiSpaceDetail })));
const WikiSpaceGraph = lazy(() => import('./pages/WikiSpaceGraph').then((m) => ({ default: m.WikiSpaceGraph })));
const WikiPageEditor = lazy(() => import('./pages/WikiPageEditor').then((m) => ({ default: m.WikiPageEditor })));
const DocumentChannelSettings = lazy(() => import('./pages/DocumentChannelSettings').then((m) => ({ default: m.DocumentChannelSettings })));
const ArticleDetail = lazy(() => import('./pages/ArticleDetail').then((m) => ({ default: m.ArticleDetail })));
const ConsoleDatasetDetail = lazy(() => import('./pages/console/ConsoleDatasetDetail').then((m) => ({ default: m.ConsoleDatasetDetail })));
const Taxonomy = lazy(() => import('./pages/Taxonomy').then((m) => ({ default: m.Taxonomy })));
function EvaluationDatasetDetailPage() {
  const { id } = useParams();
  return <EvaluationDatasetDetail key={id ?? ''} />;
}

function LegacyConsoleDatasetRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ontology/datasets/${id ?? ''}`} replace />;
}

function LegacyTaxonomyPathRedirect() {
  const location = useLocation();
  const tail = `${location.search ?? ''}${location.hash ?? ''}`;
  return <Navigate to={`/knowledge-map${tail}`} replace />;
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
          <Route path="knowledge-map" element={<FeatureGate feature="taxonomy"><Taxonomy /></FeatureGate>} />
          <Route path="taxonomy" element={<FeatureGate feature="taxonomy"><LegacyTaxonomyPathRedirect /></FeatureGate>} />
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
          <Route path="wikis" element={<FeatureGate feature="wikiSpaces"><WikiSpaceList /></FeatureGate>} />
          <Route path="wikis/:id/graph" element={<FeatureGate feature="wikiSpaces"><WikiSpaceGraph /></FeatureGate>} />
          <Route path="wikis/:id" element={<FeatureGate feature="wikiSpaces"><WikiSpaceDetail /></FeatureGate>} />
          <Route path="wikis/:id/pages/:pageId" element={<FeatureGate feature="wikiSpaces"><WikiPageEditor /></FeatureGate>} />
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
          <Route path="ontology" element={<FeatureGate feature="objectsAndLinks"><Outlet /></FeatureGate>}>
            <Route index element={<OntologyList />} />
            <Route path="datasets" element={<ConsoleDatasets />} />
            <Route path="datasets/:id" element={<ConsoleDatasetDetail />} />
            <Route path="object-types" element={<ConsoleObjectTypes />} />
            <Route path="link-types" element={<ConsoleLinkTypes />} />
          </Route>
          <Route path="objects" element={<FeatureGate feature="objectsAndLinks"><ObjectsList /></FeatureGate>} />
          <Route path="objects/:typeId" element={<FeatureGate feature="objectsAndLinks"><ObjectTypeDetail /></FeatureGate>} />
          <Route path="links" element={<FeatureGate feature="objectsAndLinks"><LinksList /></FeatureGate>} />
          <Route path="links/:typeId" element={<FeatureGate feature="objectsAndLinks"><LinkTypeDetail /></FeatureGate>} />
          <Route path="object-explorer" element={<FeatureGate feature="objectsAndLinks"><ObjectExplorer /></FeatureGate>} />
          <Route path="console/datasets" element={<Navigate to="/ontology/datasets" replace />} />
          <Route path="console/datasets/:id" element={<LegacyConsoleDatasetRedirect />} />
          <Route path="console/object-types" element={<Navigate to="/ontology/object-types" replace />} />
          <Route path="console/link-types" element={<Navigate to="/ontology/link-types" replace />} />
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleOverview />} />
            <Route path="permission-management" element={<ConsolePermissionManagement />} />
            <Route path="data-security/groups" element={<ConsoleDataSecurityGroups />} />
            <Route path="data-security/groups/:groupId/access" element={<ConsoleGroupDataAccess />} />
            <Route path="data-security/data-resources" element={<ConsoleDataResources />} />
            <Route path="data-sources" element={<ConsoleDataSources />} />
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
