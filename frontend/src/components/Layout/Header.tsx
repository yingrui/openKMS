import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, PanelLeft } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSystemPublic } from '../../contexts/SystemPublicContext';
import { useOntologyMobileRail } from '../../contexts/OntologyMobileRailContext';
import { useConsoleMobileNav } from '../../contexts/ConsoleMobileNavContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import { isConsoleShellPath } from '../../config/appModules';
import logo from '../../assets/logo.svg';
import { UserMenu } from './UserMenu';
import './Header.scss';

export function Header() {
  const { t } = useTranslation('layout');
  const location = useLocation();
  const navigate = useNavigate();
  const consoleShell = isConsoleShellPath(location.pathname);
  const { canAccessConsole } = useAuth();
  const { systemName } = useSystemPublic();
  const { ontologyRailAvailable, ontologyRailOpen, toggleOntologyRail } = useOntologyMobileRail();
  const { consoleNavOpen, toggleConsoleNav } = useConsoleMobileNav();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [headerQuery, setHeaderQuery] = useState('');
  const isMobile = useIsMobile();
  const compactSearch = isMobile;

  // The search box mirrors the URL. Adjusted during render (not in an effect) so the box never
  // shows the previous query for a frame after a navigation.
  const searchKey = `${location.pathname}|${location.search}`;
  const [lastSearchKey, setLastSearchKey] = useState(searchKey);
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey);
    setHeaderQuery(
      location.pathname === '/search'
        ? new URLSearchParams(location.search).get('q') ?? ''
        : '',
    );
  }

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
        <UserMenu />
      </div>
    </header>
  );
}
