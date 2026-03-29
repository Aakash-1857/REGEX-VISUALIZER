/**
 * AutomataContext.tsx — React Context + Provider for the automata state.
 *
 * Wraps the reducer and provides state + dispatch to the entire app.
 * Components must NOT use useContext directly — use the useAutomata() hook instead.
 */

import { createContext, useReducer, type ReactNode } from 'react';
import { automataReducer, initialState, type AutomataAction } from './reducer';
import type { AutomataState } from '../types/automata';

/** Context value: state + dispatch function. */
export interface AutomataContextValue {
  state: AutomataState;
  dispatch: React.Dispatch<AutomataAction>;
}

/** The React Context. Exported only for the useAutomata hook. */
export const AutomataContext = createContext<AutomataContextValue | null>(null);

/** Provider component — wrap your app with this. */
export function AutomataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(automataReducer, initialState);

  return (
    <AutomataContext.Provider value={{ state, dispatch }}>
      {children}
    </AutomataContext.Provider>
  );
}
