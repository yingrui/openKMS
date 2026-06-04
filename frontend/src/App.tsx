import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Routes, Route, Outlet, useParams, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext';
import { DocumentChannelsProvider } from './contexts/DocumentChannelsContext';
import { ArticleChannelsProvider } from './contexts/ArticleChannelsContext';
import { MainLayout } from './components/Layout/MainLayout';
import { Home } from './pages/Home';
import { GlobalSearch } from './pages/GlobalSearch';
import { Profile } from './pages/Profile';
import { UserSettings } from './pages/UserSettings';
import { Login } from './pages/auth/Login';
import { OidcCallback } from './pages/auth/OidcCallback';
import { OidcSilentRenew } from './pages/auth/OidcSilentRenew';
import { Signup } from './pages/auth/Signup';
import { DocumentChannel } from './pages/documents/DocumentChannel';
import { DocumentsIndex } from './pages/documents/DocumentsIndex';
import { ArticlesIndex } from './pages/articles/ArticlesIndex';
import { ArticleChannel } from './pages/articles/ArticleChannel';
import { ArticleChannels } from './pages/articles/ArticleChannels';
import { KnowledgeBaseList } from './pages/knowledge-bases/KnowledgeBaseList';
import { WikiSpaceList } from './pages/wiki/WikiSpaceList';
import { GlossaryList } from './pages/glossaries/GlossaryList';
import { GlossaryDetail } from './pages/glossaries/GlossaryDetail';
import { GlossarySettings } from './pages/glossaries/GlossarySettings';
import { DocumentChannels } from './pages/documents/DocumentChannels';
import { ConsoleLayout } from './pages/console/ConsoleLayout';
import { ConsoleOverview } from './pages/console/ConsoleOverview';
import { ConsoleSettings } from './pages/console/ConsoleSettings';
import { ConsoleUsers } from './pages/console/ConsoleUsers';
import { ConsoleFeatureToggles } from './pages/console/ConsoleFeatureToggles';
import { ConsoleHealth } from './pages/console/ConsoleHealth';
import { ObjectTypesPage } from './pages/ontology/ObjectTypesPage';
import { LinkTypesPage } from './pages/ontology/LinkTypesPage';
import { ObjectTypeSettings } from './pages/ontology/ObjectTypeSettings';
import { LinkTypeSettings } from './pages/ontology/LinkTypeSettings';
import { ConsoleDataSources } from './pages/console/ConsoleDataSources';
import { ConnectorsPage } from './pages/connectors/ConnectorsPage';
import { ConsoleDatasets } from './pages/console/ConsoleDatasets';
import { ConsolePermissionManagement } from './pages/console/ConsolePermissionManagement';
import { ConsoleAccessGroups } from './pages/console/ConsoleAccessGroups';
import { ConsoleDataSecurityIssues } from './pages/console/ConsoleDataSecurityIssues';
import { EvaluationDatasetList } from './pages/evaluation/EvaluationDatasetList';
import { EvaluationDatasetDetail } from './pages/evaluation/EvaluationDatasetDetail';
import { EvaluationDatasetSettings } from './pages/evaluation/EvaluationDatasetSettings';
import { FeatureGate } from './components/FeatureGate';
import { ErrorBoundary } from './components/ErrorBoundary';

function GroupMembersLegacyRedirect() {
  const { groupId = '' } = useParams<{ groupId: string }>();
  return <Navigate to={`/console/data-security/groups/${groupId}`} replace />;
}

function LegacyJobRunRedirect() {
  const { jobId = '' } = useParams<{ jobId: string }>();
  return <Navigate to={`/job-runs/${jobId}`} replace />;
}

function AppLoadingFallback() {
  const { t } = useTranslation('common');
  return (
    <div className="app-loading" aria-live="polite">
      {t('appLoading')}
    </div>
  );
}

const KnowledgeBaseDetail = lazy(() =>
  import('./pages/knowledge-bases/KnowledgeBaseDetail').then((m) => ({ default: m.KnowledgeBaseDetail })),
);
const Pipelines = lazy(() => import('./pages/pipelines/Pipelines').then((m) => ({ default: m.Pipelines })));
const JobRuns = lazy(() => import('./pages/jobs/JobRuns').then((m) => ({ default: m.JobRuns })));
const JobDetail = lazy(() => import('./pages/jobs/JobDetail').then((m) => ({ default: m.JobDetail })));
const Models = lazy(() => import('./pages/models/Models').then((m) => ({ default: m.Models })));
const ModelDetail = lazy(() => import('./pages/models/ModelDetail').then((m) => ({ default: m.ModelDetail })));
const OntologyList = lazy(() => import('./pages/ontology/OntologyList').then((m) => ({ default: m.OntologyList })));
const ObjectsList = lazy(() => import('./pages/ontology/ObjectsList').then((m) => ({ default: m.ObjectsList })));
const ObjectTypeDetail = lazy(() => import('./pages/ontology/ObjectTypeDetail').then((m) => ({ default: m.ObjectTypeDetail })));
const LinksList = lazy(() => import('./pages/ontology/LinksList').then((m) => ({ default: m.LinksList })));
const LinkTypeDetail = lazy(() => import('./pages/ontology/LinkTypeDetail').then((m) => ({ default: m.LinkTypeDetail })));
const ObjectExplorer = lazy(() => import('./pages/ontology/ObjectExplorer').then((m) => ({ default: m.ObjectExplorer })));
const DocumentDetail = lazy(() => import('./pages/documents/DocumentDetail').then((m) => ({ default: m.DocumentDetail })));
const WikiSpaceSettings = lazy(() =>
  import('./pages/wiki/WikiSpaceSettings').then((m) => ({ default: m.WikiSpaceSettings })),
);
const WikiWorkspace = lazy(() => import('./pages/wiki/WikiWorkspace').then((m) => ({ default: m.WikiWorkspace })));
const DocumentChannelSettings = lazy(() =>
  import('./pages/documents/DocumentChannelSettings').then((m) => ({ default: m.DocumentChannelSettings })),
);
const ArticleDetail = lazy(() => import('./pages/articles/ArticleDetail').then((m) => ({ default: m.ArticleDetail })));
const ArticleChannelSettings = lazy(() =>
  import('./pages/articles/ArticleChannelSettings').then((m) => ({ default: m.ArticleChannelSettings })),
);
const ConsoleDatasetDetail = lazy(() => import('./pages/console/ConsoleDatasetDetail').then((m) => ({ default: m.ConsoleDatasetDetail })));
const DatasetSettings = lazy(() => import('./pages/console/DatasetSettings').then((m) => ({ default: m.DatasetSettings })));
const KnowledgeMap = lazy(() => import('./pages/knowledge-map/KnowledgeMap').then((m) => ({ default: m.KnowledgeMap })));
function EvaluationDatasetDetailPage() {
  const { id } = useParams();
  return <EvaluationDatasetDetail key={id ?? ''} />;
}

function LegacyConsoleDatasetRedirect() {
  const { id } = useParams();
  return <Navigate to={`/ontology/datasets/${id ?? ''}`} replace />;
}

function WikiSpacePagesGate() {
  const { id } = useParams();
  return <WikiWorkspace key={id ?? ''} />;
}

function WikiSpaceRootToGraph() {
  const { id } = useParams();
  return <Navigate to={`/wikis/${id ?? ''}/pages/graph`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <AuthProvider>
      <FeatureTogglesProvider>
      <DocumentChannelsProvider>
      <ArticleChannelsProvider>
      <ErrorBoundary>
      <Suspense fallback={<AppLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/auth/callback" element={<OidcCallback />} />
        <Route path="/auth/silent-renew" element={<OidcSilentRenew />} />
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="knowledge-map" element={<KnowledgeMap />} />
          <Route path="search" element={<GlobalSearch />} />
          <Route path="documents" element={<Outlet />}>
            <Route index element={<DocumentsIndex />} />
            <Route path="channels/:channelId/settings" element={<DocumentChannelSettings />} />
            <Route path="channels/:channelId" element={<DocumentChannel />} />
            <Route path="channels" element={<DocumentChannels />} />
            <Route path="view/:id" element={<DocumentDetail />} />
          </Route>
          <Route path="articles" element={<Outlet />}>
            <Route index element={<ArticlesIndex />} />
            <Route path="channels/:channelId/settings" element={<ArticleChannelSettings />} />
            <Route path="channels/:channelId" element={<ArticleChannel />} />
            <Route path="channels" element={<ArticleChannels />} />
            <Route path="view/:id" element={<ArticleDetail />} />
          </Route>
          <Route path="knowledge-bases" element={<KnowledgeBaseList />} />
          <Route path="knowledge-bases/:id" element={<KnowledgeBaseDetail />} />
          <Route path="wikis" element={<WikiSpaceList />} />
          <Route path="wikis/:id/pages/graph" element={<WikiSpacePagesGate />} />
          <Route path="wikis/:id/pages/:pageId" element={<WikiSpacePagesGate />} />
          <Route path="wikis/:id/settings" element={<WikiSpaceSettings />} />
          <Route path="wikis/:id" element={<WikiSpaceRootToGraph />} />
          <Route path="evaluations" element={<FeatureGate feature="evaluations"><EvaluationDatasetList /></FeatureGate>} />
          <Route path="evaluations/:id/settings" element={<FeatureGate feature="evaluations"><EvaluationDatasetSettings /></FeatureGate>} />
          <Route path="evaluations/:id" element={<FeatureGate feature="evaluations"><EvaluationDatasetDetailPage /></FeatureGate>} />
          <Route path="glossaries" element={<GlossaryList />} />
          <Route path="glossaries/:id/settings" element={<GlossarySettings />} />
          <Route path="glossaries/:id" element={<GlossaryDetail />} />
          <Route path="connectors" element={<FeatureGate feature="connectors"><ConnectorsPage /></FeatureGate>} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<UserSettings />} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="job-runs" element={<JobRuns />} />
          <Route path="job-runs/:jobId" element={<JobDetail />} />
          <Route path="jobs" element={<Navigate to="/job-runs" replace />} />
          <Route path="jobs/:jobId" element={<LegacyJobRunRedirect />} />
          <Route path="models" element={<Models />} />
          <Route path="models/:modelId" element={<ModelDetail />} />
          <Route path="ontology" element={<Outlet />}>
            <Route index element={<OntologyList />} />
            <Route path="datasets" element={<ConsoleDatasets />} />
            <Route path="datasets/:id" element={<ConsoleDatasetDetail />} />
            <Route path="datasets/:id/settings" element={<DatasetSettings />} />
            <Route path="object-types" element={<ObjectTypesPage />} />
            <Route path="object-types/:typeId/settings" element={<ObjectTypeSettings />} />
            <Route path="link-types" element={<LinkTypesPage />} />
            <Route path="link-types/:linkTypeId/settings" element={<LinkTypeSettings />} />
          </Route>
          <Route path="objects" element={<ObjectsList />} />
          <Route path="objects/:typeId" element={<ObjectTypeDetail />} />
          <Route path="links" element={<LinksList />} />
          <Route path="links/:typeId" element={<LinkTypeDetail />} />
          <Route path="object-explorer" element={<ObjectExplorer />} />
          <Route path="console/datasets" element={<Navigate to="/ontology/datasets" replace />} />
          <Route path="console/datasets/:id" element={<LegacyConsoleDatasetRedirect />} />
          <Route path="console/object-types" element={<Navigate to="/ontology/object-types" replace />} />
          <Route path="console/link-types" element={<Navigate to="/ontology/link-types" replace />} />
          <Route path="console/connectors" element={<Navigate to="/connectors" replace />} />
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<ConsoleOverview />} />
            <Route path="health" element={<ConsoleHealth />} />
            <Route path="permission-management" element={<ConsolePermissionManagement />} />
            <Route path="data-security/issues" element={<ConsoleDataSecurityIssues />} />
            <Route
              path="data-security/overview"
              element={<Navigate to="/console/data-security/issues" replace />}
            />
            <Route path="data-security/groups" element={<ConsoleAccessGroups />} />
            <Route path="data-security/groups/:groupId" element={<ConsoleAccessGroups />} />
            <Route
              path="data-security/groups/:groupId/members"
              element={<GroupMembersLegacyRedirect />}
            />
            <Route
              path="data-security/groups/:groupId/access"
              element={<GroupMembersLegacyRedirect />}
            />
            <Route path="data-sources" element={<ConsoleDataSources />} />
            <Route path="settings" element={<ConsoleSettings />} />
            <Route path="users" element={<ConsoleUsers />} />
            <Route path="feature-toggles" element={<ConsoleFeatureToggles />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
      </ErrorBoundary>
      </ArticleChannelsProvider>
      </DocumentChannelsProvider>
      </FeatureTogglesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
