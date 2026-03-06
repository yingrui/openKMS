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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/view/:id" element={<DocumentDetail />} />
          <Route path="articles" element={<Articles />} />
          <Route path="articles/view/:id" element={<ArticleDetail />} />
          <Route path="knowledge-bases" element={<KnowledgeBaseList />} />
          <Route path="knowledge-bases/:id" element={<KnowledgeBaseDetail />} />
          <Route path="pipelines" element={<Pipelines />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="models" element={<Models />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
