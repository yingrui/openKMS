import { Search, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import './Header.css';

export function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  return (
    <header className="header">
      <div className="header-search">
        <Search size={18} className="header-search-icon" />
        <input
          type="search"
          placeholder="Search documents and articles..."
          className="header-search-input"
          aria-label="Search"
        />
        <kbd className="header-search-kbd">⌘K</kbd>
      </div>
      <div className="header-actions">
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
      </div>
    </header>
  );
}
