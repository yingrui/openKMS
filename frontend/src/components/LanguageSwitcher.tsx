import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import i18n, { OPENKMS_LOCALE_STORAGE_KEY } from '../i18n/config';
import './LanguageSwitcher.scss';

const OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'en', labelKey: 'languageEnglish' },
  { value: 'zh-CN', labelKey: 'languageChinese' },
];

export function LanguageSwitcher({ idPrefix = 'lang' }: { idPrefix?: string }) {
  const { t } = useTranslation('layout');
  const current = i18n.language?.startsWith('zh') ? 'zh-CN' : 'en';

  return (
    <div className="language-switcher">
      <Languages size={18} strokeWidth={1.75} className="language-switcher-icon" aria-hidden />
      <label htmlFor={`${idPrefix}-select`} className="sr-only">
        {t('language')}
      </label>
      <select
        id={`${idPrefix}-select`}
        className="language-switcher-select"
        value={current}
        onChange={(e) => {
          const lng = e.target.value;
          void i18n.changeLanguage(lng);
          try {
            localStorage.setItem(OPENKMS_LOCALE_STORAGE_KEY, lng);
          } catch {
            /* ignore */
          }
        }}
        aria-label={t('language')}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
