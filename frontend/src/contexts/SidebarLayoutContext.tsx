import { createContext, useContext, type ReactNode } from 'react';

type SidebarLayoutContextValue = {
  sidebarCollapsed: boolean;
};

const SidebarLayoutContext = createContext<SidebarLayoutContextValue>({
  sidebarCollapsed: false,
});

export function SidebarLayoutProvider({
  sidebarCollapsed,
  children,
}: {
  sidebarCollapsed: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarLayoutContext.Provider value={{ sidebarCollapsed }}>
      {children}
    </SidebarLayoutContext.Provider>
  );
}

export function useSidebarLayout(): SidebarLayoutContextValue {
  return useContext(SidebarLayoutContext);
}
