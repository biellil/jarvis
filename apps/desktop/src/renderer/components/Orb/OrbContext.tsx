import { createContext, useContext, useState, ReactNode } from 'react';

// Type per D-11 in CONTEXT.md
export type OrbState = 'idle' | 'listening' | 'processing' | 'responding';

interface OrbContextValue {
  state: OrbState;
  setState: (newState: OrbState) => void;
}

const OrbContext = createContext<OrbContextValue | undefined>(undefined);

export function OrbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OrbState>('idle');

  return (
    <OrbContext.Provider value={{ state, setState }}>
      {children}
    </OrbContext.Provider>
  );
}

export function useOrbContext() {
  const context = useContext(OrbContext);
  if (context === undefined) {
    throw new Error('useOrbContext must be used within OrbProvider');
  }
  return context;
}
