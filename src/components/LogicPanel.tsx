/**
 * LogicPanel.tsx — Right sidebar (~260px) for formal definitions and testing.
 *
 * Contains:
 * - Formal definition table: Σ, Q, q₀, F, δ (transition table)
 * - String tester with step-by-step trace
 * - ReductionBadge (MinDFA stage)
 * - Equivalence result (comparison mode)
 * - JSON export
 */

import { useState } from 'react';
import { useAutomata } from '../hooks/useAutomata';
import { ReductionBadge } from './ReductionBadge';
import { simulateTrace } from '../logic/StringGenerator';
import { generateAccepted, generateRejected } from '../logic/StringGenerator';
import type { NFA, DFA, MinDFA, StateId } from '../types/automata';

export function LogicPanel() {
  const { state, dispatch } = useAutomata();

  // Get active automaton for the formal definition display
  const getActiveAutomaton = (): NFA | DFA | MinDFA | null => {
    switch (state.activeStage) {
      case 'nfa': return state.pipeline.nfa;
      case 'dfa': return state.pipeline.dfa;
      case 'minDfa': return state.pipeline.minDfa;
      default: return null;
    }
  };

  const automaton = getActiveAutomaton();

  return (
    <div className="panel flex flex-col h-full" style={{ width: 260, minWidth: 260 }}>
      <div className="panel-header">Formal Definition</div>

      <div className="flex flex-col flex-1 overflow-y-auto p-3 gap-4">
        {automaton ? (
          <>
            {/* ── 5-Tuple Display ── */}
            <FiveTuple automaton={automaton} />

            {/* ── Transition Table ── */}
            <TransitionTable automaton={automaton} onHighlight={(s) => dispatch({ type: 'SET_HIGHLIGHTED', payload: new Set([s]) })} />

            {/* ── Reduction Badge (MinDFA only) ── */}
            {state.activeStage === 'minDfa' && <ReductionBadge />}

            {/* ── String Tester ── */}
            <StringTester />

            {/* ── Generated Strings ── */}
            {state.pipeline.minDfa && <GeneratedStrings minDfa={state.pipeline.minDfa} />}

            {/* ── Equivalence Result (comparison mode) ── */}
            {state.mode === 'comparison' && state.equivalenceResult && (
              <EquivalenceDisplay />
            )}

            {/* ── JSON Export ── */}
            <JSONExport automaton={automaton} />
          </>
        ) : (
          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
            No automaton to display. Enter a regex and it will be processed automatically.
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════

/** Display the formal 5-tuple: M = (Q, Σ, δ, q₀, F). */
function FiveTuple({ automaton }: { automaton: NFA | DFA | MinDFA }) {
  return (
    <div>
      <div className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
        5-Tuple
      </div>
      <table>
        <tbody>
          <tr>
            <th className="math">Q</th>
            <td>{'{' + [...automaton.states].join(', ') + '}'}</td>
          </tr>
          <tr>
            <th className="math">Σ</th>
            <td>{'{' + [...automaton.alphabet].join(', ') + '}'}</td>
          </tr>
          <tr>
            <th className="math">q₀</th>
            <td>{automaton.startState}</td>
          </tr>
          <tr>
            <th className="math">F</th>
            <td>{'{' + [...automaton.acceptStates].join(', ') + '}'}</td>
          </tr>
          <tr>
            <th className="math">|Q|</th>
            <td>{automaton.states.size}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Transition table: δ(state, symbol) → target(s). */
function TransitionTable({
  automaton,
  onHighlight,
}: {
  automaton: NFA | DFA | MinDFA;
  onHighlight: (state: StateId) => void;
}) {
  const isNFA = isNFAType(automaton);
  const alphabet = [...automaton.alphabet].filter(s => s !== '').sort();

  // For NFA, include ε column
  const columns = isNFA ? ['ε', ...alphabet] : alphabet;

  return (
    <div>
      <div className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
        δ — Transition Table
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th className="math">δ</th>
              {columns.map((c) => (
                <th key={c} className="math">{c === '' ? 'ε' : c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...automaton.states].map((stateId) => (
              <tr key={stateId} onClick={() => onHighlight(stateId)}>
                <td>
                  {automaton.startState === stateId && '→ '}
                  {automaton.acceptStates.has(stateId) && '* '}
                  {stateId}
                </td>
                {columns.map((symbol) => {
                  const sym = symbol === 'ε' ? '' : symbol;
                  const transMap = automaton.transitions.get(stateId);
                  if (isNFA) {
                    const targets = (transMap as Map<string, Set<StateId>> | undefined)?.get(sym);
                    return (
                      <td key={symbol}>
                        {targets ? '{' + [...targets].join(',') + '}' : '∅'}
                      </td>
                    );
                  } else {
                    const target = (transMap as Map<string, StateId> | undefined)?.get(sym);
                    return <td key={symbol}>{target ?? '—'}</td>;
                  }
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** String tester: input a string, simulate, show trace. */
function StringTester() {
  const { state, dispatch } = useAutomata();
  const [testInput, setTestInput] = useState('');

  const runTest = () => {
    const automaton = state.activeStage === 'minDfa'
      ? state.pipeline.minDfa
      : state.activeStage === 'dfa'
      ? state.pipeline.dfa
      : null;

    if (!automaton) return;

    dispatch({ type: 'SET_TEST_STRING', payload: testInput });
    const result = simulateTrace(automaton, testInput);
    dispatch({ type: 'SET_TEST_TRACE', payload: result });
    dispatch({ type: 'SET_HIGHLIGHTED', payload: new Set(result.trace) });
  };

  return (
    <div>
      <div className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
        String Tester
      </div>
      <div className="flex gap-1 mb-2">
        <input
          id="string-tester-input"
          type="text"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
          placeholder='e.g. "aabb"'
          style={{ flex: 1 }}
          onKeyDown={(e) => e.key === 'Enter' && runTest()}
        />
        <button onClick={runTest} disabled={!state.pipeline.dfa && !state.pipeline.minDfa}>
          Test
        </button>
      </div>

      {state.testStatus !== 'idle' && (
        <div>
          <div className={`badge ${state.testStatus === 'accepted' ? 'badge-accepted' : 'badge-rejected'}`}>
            {state.testStatus === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
          </div>
          {state.testTrace.length > 0 && (
            <div className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
              Trace: {state.testTrace.join(' → ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Generated accepted/rejected strings. */
function GeneratedStrings({ minDfa }: { minDfa: MinDFA }) {
  const accepted = generateAccepted(minDfa, { maxLength: 8, maxResults: 8 });
  const rejected = generateRejected(minDfa, { maxLength: 6, maxResults: 8 });

  return (
    <div>
      <div className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
        Sample Strings
      </div>
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="text-xs mb-1" style={{ color: 'var(--color-accept)' }}>
            Accepted
          </div>
          <div className="text-xs">
            {accepted.length > 0
              ? accepted.map((s, i) => (
                  <div key={i}>{s === '' ? 'ε' : s}</div>
                ))
              : <span style={{ color: 'var(--color-muted)' }}>∅</span>}
          </div>
        </div>
        <div className="flex-1">
          <div className="text-xs mb-1" style={{ color: 'var(--color-reject)' }}>
            Rejected
          </div>
          <div className="text-xs">
            {rejected.length > 0
              ? rejected.map((s, i) => (
                  <div key={i}>{s === '' ? 'ε' : s}</div>
                ))
              : <span style={{ color: 'var(--color-muted)' }}>∅</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Equivalence result display (comparison mode). */
function EquivalenceDisplay() {
  const { state } = useAutomata();
  const result = state.equivalenceResult;
  if (!result) return null;

  return (
    <div>
      <div className="text-xs mb-1 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
        Equivalence
      </div>
      <div className={`badge ${result.equivalent ? 'badge-accepted' : 'badge-rejected'}`} style={{ marginBottom: 4 }}>
        {result.equivalent ? '✓ L(RE₁) = L(RE₂)' : '✗ L(RE₁) ≠ L(RE₂)'}
      </div>

      {result.equivalent && result.bijection && (
        <div style={{ marginTop: 4 }}>
          <div className="text-xs" style={{ color: 'var(--color-muted)' }}>Bijection:</div>
          <table style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr>
                <th className="math">RE₁</th>
                <th className="math">RE₂</th>
              </tr>
            </thead>
            <tbody>
              {[...result.bijection].map(([a, b]) => (
                <tr key={a}>
                  <td>{a}</td>
                  <td>{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!result.equivalent && result.witness !== null && (
        <div className="mt-1 text-xs">
          <span style={{ color: 'var(--color-muted)' }}>Witness: </span>
          <span className="mono" style={{ color: 'var(--color-accent)' }}>
            "{result.witness === '' ? 'ε' : result.witness}"
          </span>
        </div>
      )}
    </div>
  );
}

/** JSON export button. */
function JSONExport({ automaton }: { automaton: NFA | DFA | MinDFA }) {
  const exportJSON = () => {
    // Convert Sets and Maps to JSON-serializable format
    const serializable = {
      states: [...automaton.states],
      alphabet: [...automaton.alphabet],
      startState: automaton.startState,
      acceptStates: [...automaton.acceptStates],
      transitions: serializeTransitions(automaton),
    };

    const json = JSON.stringify(serializable, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'automaton.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button onClick={exportJSON} style={{ width: '100%' }}>
      Export JSON
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function isNFAType(automaton: NFA | DFA | MinDFA): automaton is NFA {
  for (const [, transMap] of automaton.transitions) {
    for (const [, value] of transMap) {
      return value instanceof Set;
    }
  }
  return false;
}

function serializeTransitions(automaton: NFA | DFA | MinDFA): Record<string, Record<string, string | string[]>> {
  const result: Record<string, Record<string, string | string[]>> = {};
  const isNFA = isNFAType(automaton);

  for (const [state, transMap] of automaton.transitions) {
    result[state] = {};
    if (isNFA) {
      for (const [sym, targets] of transMap as Map<string, Set<StateId>>) {
        result[state][sym || 'ε'] = [...targets];
      }
    } else {
      for (const [sym, target] of transMap as Map<string, StateId>) {
        result[state][sym] = target;
      }
    }
  }
  return result;
}
