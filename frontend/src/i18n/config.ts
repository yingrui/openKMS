import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enApiErrors from './locales/en/apiErrors.json';
import enAuth from './locales/en/auth.json';
import enCommon from './locales/en/common.json';
import enConsole from './locales/en/console.json';
import enDocuments from './locales/en/documents.json';
import enHome from './locales/en/home.json';
import enExplore from './locales/en/explore.json';
import enLanding from './locales/en/landing.json';
import enLayout from './locales/en/layout.json';
import enProfile from './locales/en/profile.json';
import enSearch from './locales/en/search.json';
import enSettings from './locales/en/settings.json';
import zhApiErrors from './locales/zh-CN/apiErrors.json';
import zhAuth from './locales/zh-CN/auth.json';
import zhCommon from './locales/zh-CN/common.json';
import zhConsole from './locales/zh-CN/console.json';
import zhDocuments from './locales/zh-CN/documents.json';
import zhHome from './locales/zh-CN/home.json';
import zhExplore from './locales/zh-CN/explore.json';
import zhLanding from './locales/zh-CN/landing.json';
import zhLayout from './locales/zh-CN/layout.json';
import zhProfile from './locales/zh-CN/profile.json';
import zhSearch from './locales/zh-CN/search.json';
import zhSettings from './locales/zh-CN/settings.json';
import enWorkspace from './locales/en/workspace.json';
import zhWorkspace from './locales/zh-CN/workspace.json';
import enArticles from './locales/en/articles.json';
import zhArticles from './locales/zh-CN/articles.json';
import enKnowledgeMap from './locales/en/knowledgeMap.json';
import zhKnowledgeMap from './locales/zh-CN/knowledgeMap.json';
import enObjectExplorer from './locales/en/objectExplorer.json';
import zhObjectExplorer from './locales/zh-CN/objectExplorer.json';
import enWikiSpace from './locales/en/wikiSpace.json';
import zhWikiSpace from './locales/zh-CN/wikiSpace.json';
import enKnowledgeBase from './locales/en/knowledgeBase.json';
import zhKnowledgeBase from './locales/zh-CN/knowledgeBase.json';

export const OPENKMS_LOCALE_STORAGE_KEY = 'openkms_locale';

/** Apply locale from authenticated GET/PATCH /api/auth/me (persists to localStorage for API Accept-Language). */
export function applyLocalePreference(locale: 'en' | 'zh-CN'): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(OPENKMS_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    document.documentElement.setAttribute('data-ui-locale', locale);
  }
}

/** When ``/me`` includes a saved ``ui_locale``, switch UI and html lang; otherwise leave detector defaults. */
export function applyLocaleFromAuthMe(ui_locale: string | null | undefined): void {
  if (ui_locale === 'en' || ui_locale === 'zh-CN') {
    applyLocalePreference(ui_locale);
  }
}

export function getStoredLocale(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(OPENKMS_LOCALE_STORAGE_KEY);
    if (stored) return stored;
  }
  const lng = i18n.language || 'en';
  return lng.startsWith('zh') ? 'zh-CN' : 'en';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh-CN'],
    ns: [
      'common',
      'layout',
      'auth',
      'home',
      'landing',
      'settings',
      'profile',
      'search',
      'explore',
      'workspace',
      'console',
      'apiErrors',
      'documents',
      'articles',
      'knowledgeMap',
      'objectExplorer',
      'wikiSpace',
      'knowledgeBase',
    ],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: OPENKMS_LOCALE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    resources: {
      en: {
        common: enCommon,
        layout: enLayout,
        auth: enAuth,
        home: enHome,
        landing: enLanding,
        profile: enProfile,
        search: enSearch,
        settings: enSettings,
        console: enConsole,
        apiErrors: enApiErrors,
        documents: enDocuments,
        explore: enExplore,
        workspace: enWorkspace,
        articles: enArticles,
        knowledgeMap: enKnowledgeMap,
        objectExplorer: enObjectExplorer,
        wikiSpace: enWikiSpace,
        knowledgeBase: enKnowledgeBase,
      },
      'zh-CN': {
        common: zhCommon,
        layout: zhLayout,
        auth: zhAuth,
        home: zhHome,
        landing: zhLanding,
        profile: zhProfile,
        search: zhSearch,
        settings: zhSettings,
        console: zhConsole,
        apiErrors: zhApiErrors,
        documents: zhDocuments,
        explore: zhExplore,
        workspace: zhWorkspace,
        articles: zhArticles,
        knowledgeMap: zhKnowledgeMap,
        objectExplorer: zhObjectExplorer,
        wikiSpace: zhWikiSpace,
        knowledgeBase: zhKnowledgeBase,
      },
    },
  });

export default i18n;
