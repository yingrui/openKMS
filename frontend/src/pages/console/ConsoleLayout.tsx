import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export function ConsoleLayout() {
  const { isAuthenticated, isLoading, canAccessConsole } = useAuth();

  if (!isLoading && (!isAuthenticated || !canAccessConsole)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
