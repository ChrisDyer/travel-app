'use client';

import { createContext, useContext, type ReactNode } from 'react';

const ReadOnlyContext = createContext<boolean | null>(null);

// Populated once in the root layout from getAccessInfo() (server component, reads the
// Cloudflare Access header). Modeled on genealogy-app/research-browser/src/lib/config.tsx.
export function ReadOnlyProvider({ readOnly, children }: { readOnly: boolean; children: ReactNode }) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

export function useReadOnly(): boolean {
  const ctx = useContext(ReadOnlyContext);
  if (ctx === null) throw new Error('useReadOnly must be used within a ReadOnlyProvider');
  return ctx;
}
