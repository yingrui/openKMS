import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, User, UserCircle, Settings, LogOut, LogIn, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import './Header.css';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const onConsole = location.pathname.startsWith('/console');
  const { isAuthenticated, isLoading, user, canAccessConsole, login, logout } = useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [headerQuery, setHeaderQuery] = useState('');

  useEffect(() => {
    if (location.pathname === '/search') {
      const q = new URLSearchParams(location.search).get('q') ?? '';
      setHeaderQuery(q);
    } else {
      setHeaderQuery('');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="header">
      <div className="header-search">
        <Search size={18} className="header-search-icon" />
        <input
          ref={searchInputRef}
          type="search"
          value={headerQuery}
          onChange={(e) => setHeaderQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const q = headerQuery.trim();
              navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
            }
          }}
          placeholder="Search documents, articles, ..."
          className="header-search-input"
          aria-label="Search"
        />
        <kbd className="header-search-kbd">⌘K</kbd>
      </div>
      <div className="header-actions">
        {canAccessConsole &&
          (onConsole ? (
            <Link to="/" className="header-console-link header-console-link--exit">
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
              <span>Exit Console</span>
            </Link>
          ) : (
            <NavLink
              to="/console"
              className={({ isActive }) =>
                `header-console-link ${isActive ? 'header-console-link-active' : ''}`
              }
            >
              <span>Console</span>
            </NavLink>
          ))}
        <button
          type="button"
          onClick={toggleTheme}
          className="header-theme-btn"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <Moon size={20} strokeWidth={1.75} />
          ) : (
            <Sun size={20} strokeWidth={1.75} />
          )}
        </button>
        <div className="header-user-menu" ref={userMenuRef}>
          {!isLoading && !isAuthenticated ? (
            <button
              type="button"
              onClick={login}
              className="header-login-btn"
              aria-label="Log in"
            >
              <LogIn size={20} strokeWidth={1.75} />
              <span>Log in</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="header-user-btn"
                aria-label="User menu"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <User size={20} strokeWidth={1.75} />
              </button>
              {userMenuOpen && (
                <div className="header-user-dropdown">
                  <div className="header-user-dropdown-header">
                    <span className="header-user-name">{user?.name ?? user?.username ?? 'User'}</span>
                    <span className="header-user-email">{user?.email ?? ''}</span>
                  </div>
                  <div className="header-user-dropdown-divider" />
                  <Link
                    to="/profile"
                    className="header-user-dropdown-item"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <UserCircle size={18} />
                    <span>Profile</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="header-user-dropdown-item"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings size={18} />
                    <span>Settings</span>
                  </Link>
                  <div className="header-user-dropdown-divider" />
                  <button
                    type="button"
                    className="header-user-dropdown-item header-user-dropdown-item--danger"
                    onClick={logout}
                  >
                    <LogOut size={18} />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
