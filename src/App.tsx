/**
 * App.tsx — 3-Panel Dashboard for the Formal Language Laboratory.
 *
 * Layout:
 * ┌──────────┬──────────────────┬─────────┐
 * │ InputPanel│  AutomataGraph   │LogicPanel│
 * │  (~280px) │   (flex-grow)    │ (~260px) │
 * └──────────┴──────────────────┴─────────┘
 */

import { AutomataProvider } from './state/AutomataContext';
import { InputPanel } from './components/InputPanel';
import { AutomataGraph } from './components/AutomataGraph';
import { LogicPanel } from './components/LogicPanel';
import { usePipeline } from './hooks/usePipeline';

/** Inner app that uses the pipeline hook (must be inside Provider). */
function AppInner() {
  usePipeline();

  return (
    <div className="flex h-screen" style={{ minHeight: '100vh' }}>
      <InputPanel />
      <AutomataGraph />
      <LogicPanel />
    </div>
  );
}

/** Root app component wrapped in AutomataProvider. */
export default function App() {
  return (
    <AutomataProvider>
      <AppInner />
    </AutomataProvider>
  );
}
