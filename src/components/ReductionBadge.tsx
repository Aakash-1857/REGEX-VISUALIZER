/**
 * ReductionBadge.tsx — Shows DFA → MinDFA state reduction.
 *
 * Displays: originalCount → minimizedCount with a percentage reduction.
 */

import { useAutomata } from '../hooks/useAutomata';

export function ReductionBadge() {
  const { state } = useAutomata();
  const minDfa = state.pipeline.minDfa;

  if (!minDfa) return null;

  const reduction = minDfa.originalCount - minDfa.minimizedCount;
  const percent =
    minDfa.originalCount > 0
      ? Math.round((reduction / minDfa.originalCount) * 100)
      : 0;

  return (
    <div className="reduction-badge">
      <span className="math">|Q<sub>DFA</sub>|</span>
      <span>= {minDfa.originalCount}</span>
      <span className="reduction-arrow">→</span>
      <span className="math">|Q<sub>min</sub>|</span>
      <span>= {minDfa.minimizedCount}</span>
      {reduction > 0 && (
        <span style={{ color: 'var(--color-accept)', marginLeft: 4 }}>
          −{reduction} ({percent}%)
        </span>
      )}
      {reduction === 0 && (
        <span style={{ color: 'var(--color-muted)', marginLeft: 4 }}>
          (already minimal)
        </span>
      )}
    </div>
  );
}
