import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function ConsoleLayout() {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();

  if (!isLoading && (!isAuthenticated || !isAdmin)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
