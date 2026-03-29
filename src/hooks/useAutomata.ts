/**
 * useAutomata.ts — Typed hook to access AutomataContext.
 *
 * This is the ONLY sanctioned way to access the automata state.
 * Components must never call useContext(AutomataContext) directly.
 */

import { useContext } from 'react';
import { AutomataContext, type AutomataContextValue } from '../state/AutomataContext';

/**
 * Access the automata state and dispatch function.
 *
 * @throws Error if used outside of AutomataProvider.
 * @returns { state, dispatch }
 */
export function useAutomata(): AutomataContextValue {
  const context = useContext(AutomataContext);
  if (context === null) {
    throw new Error('useAutomata() must be used within an <AutomataProvider>');
  }
  return context;
}
