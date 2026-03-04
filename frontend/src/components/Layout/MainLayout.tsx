import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import '../../App.css';

export function MainLayout() {
  const location = useLocation();
  const isDetailPage = location.pathname.startsWith('/documents/view') || location.pathname.startsWith('/articles/view');
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Header />
        <div className={`app-content ${isDetailPage ? 'app-content--compact' : ''}`}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
