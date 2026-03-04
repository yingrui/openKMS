import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from './components/Layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Documents } from './pages/Documents';
import { Articles } from './pages/Articles';
import { KnowledgeBaseList } from './pages/KnowledgeBaseList';
import { KnowledgeBaseDetail } from './pages/KnowledgeBaseDetail';
import { DocumentDetail } from './pages/DocumentDetail';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/view/:id" element={<DocumentDetail />} />
          <Route path="articles" element={<Articles />} />
          <Route path="knowledge-bases" element={<KnowledgeBaseList />} />
          <Route path="knowledge-bases/:id" element={<KnowledgeBaseDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
