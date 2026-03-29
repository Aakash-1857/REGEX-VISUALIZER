/**
 * InputPanel.tsx — Left sidebar (~280px) for regex input and controls.
 *
 * Contains:
 * - Regex input field(s) with parse error highlighting
 * - Symbol palette (grouped: core operators, quantifiers, etc.)
 * - Mode toggle (single/comparison)
 * - Run pipeline trigger
 */

import { useAutomata } from '../hooks/useAutomata';
import type { ParseError } from '../types/automata';

/** Symbol palette groups for quick insertion. */
const SYMBOL_GROUPS = [
  {
    label: 'Core Operators',
    symbols: ['|', '*', '+', '?', '(', ')', 'ε', '∅'],
  },
  {
    label: 'Literals',
    symbols: ['a', 'b', 'c', '0', '1'],
  },
  {
    label: 'Escape',
    symbols: ['\\(', '\\)', '\\|', '\\*', '\\\\'],
  },
];

export function InputPanel() {
  const { state, dispatch } = useAutomata();

  /** Insert a symbol at the end of the regex input (or at cursor if we had a ref). */
  function insertSymbol(symbol: string, which: 'A' | 'B') {
    const current = which === 'A' ? state.regexA : state.regexB;
    const action = which === 'A' ? 'SET_REGEX_A' : 'SET_REGEX_B';
    dispatch({ type: action, payload: current + symbol } as Parameters<typeof dispatch>[0]);
  }

  return (
    <div className="panel flex flex-col h-full" style={{ width: 280, minWidth: 280 }}>
      {/* ── Header ── */}
      <div className="panel-header flex items-center justify-between">
        <span>Input</span>
        <ModeToggle />
      </div>

      <div className="flex flex-col flex-1 overflow-y-auto p-3 gap-4">
        {/* ── Regex A Input ── */}
        <RegexInput
          id="regex-input-a"
          label={state.mode === 'comparison' ? 'RE₁' : 'Regular Expression'}
          value={state.regexA}
          errors={state.parseErrors}
          onChange={(v) => dispatch({ type: 'SET_REGEX_A', payload: v })}
          onInsertSymbol={(s) => insertSymbol(s, 'A')}
        />

        {/* ── Regex B Input (comparison mode only) ── */}
        {state.mode === 'comparison' && (
          <RegexInput
            id="regex-input-b"
            label="RE₂"
            value={state.regexB}
            errors={state.parseErrorsB}
            onChange={(v) => dispatch({ type: 'SET_REGEX_B', payload: v })}
            onInsertSymbol={(s) => insertSymbol(s, 'B')}
          />
        )}

        {/* ── Symbol Palette ── */}
        <div>
          <div className="text-xs mb-2 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
            Symbol Palette
          </div>
          {SYMBOL_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {group.symbols.map((sym) => (
                  <button
                    key={sym}
                    className="symbol-btn"
                    title={`Insert ${sym}`}
                    onClick={() => insertSymbol(sym, 'A')}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Stage Selector ── */}
        <div>
          <div className="text-xs mb-2 uppercase tracking-wider" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
            View Stage
          </div>
          <div className="flex">
            {(['nfa', 'dfa', 'minDfa'] as const).map((stage) => (
              <button
                key={stage}
                className={`stage-tab ${state.activeStage === stage ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'SET_STAGE', payload: stage })}
              >
                {stage === 'minDfa' ? 'Min-DFA' : stage.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Pipeline Status ── */}
        <div className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {state.pipeline.nfa ? (
            <div className="flex flex-col gap-1">
              <span>NFA: {state.pipeline.nfa.states.size} states</span>
              {state.pipeline.dfa && <span>DFA: {state.pipeline.dfa.states.size} states</span>}
              {state.pipeline.minDfa && <span>MinDFA: {state.pipeline.minDfa.minimizedCount} states</span>}
            </div>
          ) : (
            <span>Enter a regular expression above</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

function ModeToggle() {
  const { state, dispatch } = useAutomata();

  return (
    <button
      className="text-xs"
      style={{ padding: '2px 8px', fontSize: '0.65rem' }}
      onClick={() =>
        dispatch({
          type: 'SET_MODE',
          payload: state.mode === 'single' ? 'comparison' : 'single',
        })
      }
    >
      {state.mode === 'single' ? '1→2' : '2→1'}
    </button>
  );
}

function RegexInput({
  id,
  label,
  value,
  errors,
  onChange,
  onInsertSymbol: _onInsertSymbol,
}: {
  id: string;
  label: string;
  value: string;
  errors: ParseError[];
  onChange: (v: string) => void;
  onInsertSymbol: (s: string) => void;
}) {
  const hasErrors = errors.length > 0;

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs mb-1 uppercase tracking-wider"
        style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. (a|b)*abb"
        className={hasErrors ? 'parse-error-underline' : ''}
        style={hasErrors ? { borderColor: 'var(--color-accent)' } : {}}
        spellCheck={false}
        autoComplete="off"
      />
      {hasErrors && (
        <div className="mt-1">
          {errors.map((err, i) => (
            <div
              key={i}
              className="text-xs"
              style={{ color: 'var(--color-accent)' }}
            >
              ⚠ {err.message} (pos {err.spanStart}–{err.spanEnd})
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
