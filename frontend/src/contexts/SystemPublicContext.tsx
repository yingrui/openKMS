import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_SYSTEM_DISPLAY_NAME, effectiveSystemDisplayName, fetchSystemPublic } from '../data/systemApi';
import { SYSTEM_SETTINGS_UPDATED_EVENT } from '../utils/systemSettingsStorage';

interface SystemPublicContextValue {
  systemName: string;
  loaded: boolean;
  reload: () => Promise<void>;
}

const SystemPublicContext = createContext<SystemPublicContextValue | null>(null);

export function SystemPublicProvider({ children }: { children: React.ReactNode }) {
  const [systemName, setSystemName] = useState('');
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const { system_name } = await fetchSystemPublic();
      setSystemName(effectiveSystemDisplayName(system_name));
    } catch {
      setSystemName(DEFAULT_SYSTEM_DISPLAY_NAME);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onUpdated = () => void reload();
    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, onUpdated);
  }, [reload]);

  return (
    <SystemPublicContext.Provider value={{ systemName, loaded, reload }}>
      {children}
    </SystemPublicContext.Provider>
  );
}

export function useSystemPublic() {
  const ctx = useContext(SystemPublicContext);
  if (!ctx) throw new Error('useSystemPublic must be used within SystemPublicProvider');
  return ctx;
}
