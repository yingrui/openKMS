import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, User, UserCircle, Settings, LogOut, LogIn, PanelLeft, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSystemPublic } from '../../contexts/SystemPublicContext';
import { useOntologyMobileRail } from '../../contexts/OntologyMobileRailContext';
import { useConsoleMobileNav } from '../../contexts/ConsoleMobileNavContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { isConsoleShellPath } from '../../config/appModules';
import logo from '../../assets/logo.svg';
import { AppLauncher } from './AppLauncher';
import './Header.scss';

export function Header() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const consoleShell = isConsoleShellPath(location.pathname);
  const { isAuthenticated, isLoading, user, canAccessConsole, login, logout } = useAuth();
  const { systemName } = useSystemPublic();
  const { ontologyRailAvailable, ontologyRailOpen, toggleOntologyRail } = useOntologyMobileRail();
  const { consoleNavOpen, toggleConsoleNav } = useConsoleMobileNav();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [headerQuery, setHeaderQuery] = useState('');
  const isMobile = useIsMobile();
  const compactSearch = isMobile;

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

  const brandName = systemName || 'openKMS';
  const showOntologyToggle = ontologyRailAvailable;
  const showConsoleNavToggle = consoleShell && canAccessConsole && isMobile;

  return (
    <header className="header">
      <div className="header-start">
        {showOntologyToggle && (
          <button
            type="button"
            className={`header-rail-toggle${ontologyRailOpen ? ' header-rail-toggle--open' : ''}`}
            onClick={toggleOntologyRail}
            aria-expanded={ontologyRailOpen}
            aria-controls="ontology-nav-rail-drawer"
            aria-label={t('openOntologyRail')}
          >
            <PanelLeft size={20} strokeWidth={1.75} />
          </button>
        )}
        {showConsoleNavToggle && (
          <button
            type="button"
            className={`header-rail-toggle${consoleNavOpen ? ' header-rail-toggle--open' : ''}`}
            onClick={toggleConsoleNav}
            aria-expanded={consoleNavOpen}
            aria-controls="console-nav-drawer"
            aria-label={t('consoleNavigation')}
          >
            <PanelLeft size={20} strokeWidth={1.75} />
          </button>
        )}
        <Link to="/" className="header-brand" title={brandName}>
          <img src={logo} alt="" className="header-brand-icon" />
          <span className="header-brand-name ds-compact-label">{brandName}</span>
        </Link>
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
            placeholder={t(compactSearch ? 'searchPlaceholderShort' : 'searchPlaceholder')}
            className="header-search-input"
            aria-label={t('searchAriaLabel')}
          />
          <kbd className="header-search-kbd">⌘K</kbd>
        </div>
      </div>
      <div className="header-actions">
        {consoleShell && canAccessConsole ? (
          <Link
            to="/"
            className="header-console-link header-console-link--exit"
            aria-label={t('exitConsole')}
          >
            <span className="ds-compact-label">{t('exitConsole')}</span>
          </Link>
        ) : null}
        {!consoleShell && <AppLauncher />}
        <button
          type="button"
          onClick={toggleTheme}
          className="header-theme-btn"
          aria-label={theme === 'light' ? t('switchToDark') : t('switchToLight')}
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
              aria-label={t('logIn')}
            >
              <LogIn size={20} strokeWidth={1.75} />
              <span className="header-login-label ds-compact-label">{t('logIn')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="header-user-btn"
                aria-label={t('userMenu')}
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <User size={20} strokeWidth={1.75} />
              </button>
              {userMenuOpen && (
                <div className="header-user-dropdown">
                  <div className="header-user-dropdown-header">
                    <span className="header-user-name">{user?.name ?? user?.username ?? t('fallbackUser')}</span>
                    <span className="header-user-email">{user?.email ?? ''}</span>
                  </div>
                  <div className="header-user-dropdown-divider" />
                  <Link
                    to="/profile"
                    className="header-user-dropdown-item"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <UserCircle size={18} />
                    <span>{t('profile')}</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="header-user-dropdown-item"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Settings size={18} />
                    <span>{t('settings')}</span>
                  </Link>
                  {canAccessConsole && !consoleShell ? (
                    <Link
                      to="/console"
                      className="header-user-dropdown-item"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <LayoutDashboard size={18} aria-hidden />
                      <span>{t('console')}</span>
                    </Link>
                  ) : null}
                  <div className="header-user-dropdown-divider" />
                  <button
                    type="button"
                    className="header-user-dropdown-item header-user-dropdown-item--danger"
                    onClick={logout}
                  >
                    <LogOut size={18} />
                    <span>{t('logOut')}</span>
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
