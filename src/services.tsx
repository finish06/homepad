// v8 §3/A12 — a tiny shared owner for the catalog's Service[] so the launcher
// filters the SAME already-loaded array the grid renders, with NO second fetch.
// The provider performs the one /api/services load; Catalog reads from it when
// present (falling back to its own fetch when rendered without a provider, e.g.
// isolated tests — the same optional-context shape as useResolvedTheme).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { services as fetchServices, type Service } from './api';

export type ServicesContextValue = {
  items: Service[] | null;
  setItems: React.Dispatch<React.SetStateAction<Service[] | null>>;
};

const ServicesContext = createContext<ServicesContextValue | null>(null);

export function ServicesProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Service[] | null>(null);
  useEffect(() => {
    fetchServices().then(setItems);
  }, []);
  return <ServicesContext.Provider value={{ items, setItems }}>{children}</ServicesContext.Provider>;
}

// Nullable on purpose: Catalog and the launcher both call it and branch on
// whether a provider is present.
export function useServicesContext(): ServicesContextValue | null {
  return useContext(ServicesContext);
}
