/**
 * logic.test.ts — 10 standard test cases for the logic engine.
 *
 * Tests cover:
 * 1. Even number of a's
 * 2. Strings ending in 'ab'
 * 3. (a|b)*
 * 4. a*b*
 * 5. (a|b)*abb (classic textbook DFA)
 * 6. Empty language ∅
 * 7. ε (empty string)
 * 8. (a*)* nested stars (redundancy collapse)
 * 9. Alphabet mismatch equivalence: a* vs b*
 * 10. Large RE (length > 30) — performance
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../logic/RegexParser';
import { toNFA, toDFA, minimize, epsilonClosure, resetStateCounter, validateDFAInvariant } from '../logic/AutomataEngine';
import { checkEquivalence } from '../logic/EquivalenceChecker';
import { generateAccepted, generateRejected, simulateAccepts, simulateTrace, simulateNFATrace } from '../logic/StringGenerator';
// Types imported for reference but tests use the pipeline helper

/**
 * Helper: run the full pipeline on a regex string.
 * Returns { nfa, dfa, minDfa } or throws on parse error.
 */
function pipeline(regex: string) {
  resetStateCounter();
  const result = parse(regex);
  if (!result.ast) throw new Error(`Parse failed for "${regex}": ${result.errors.map(e => e.message).join(', ')}`);
  const nfa = toNFA(result.ast);
  const dfa = toDFA(nfa);
  const minDfa = minimize(dfa);
  return { ast: result.ast, nfa, dfa, minDfa, errors: result.errors };
}

/** Helper: check if a string is accepted by the minimized DFA. */
function accepts(regex: string, input: string): boolean {
  const { minDfa } = pipeline(regex);
  return simulateAccepts(minDfa, input);
}

describe('RegexParser', () => {
  it('parses basic literals and concatenation', () => {
    const result = parse('ab');
    expect(result.ast).not.toBeNull();
    expect(result.ast!.type).toBe('concat');
    expect(result.errors).toHaveLength(0);
  });

  it('parses union', () => {
    const result = parse('a|b');
    expect(result.ast).not.toBeNull();
    expect(result.ast!.type).toBe('union');
  });

  it('parses star', () => {
    const result = parse('a*');
    expect(result.ast).not.toBeNull();
    expect(result.ast!.type).toBe('star');
  });

  it('parses complex expression (a|b)*abb', () => {
    const result = parse('(a|b)*abb');
    expect(result.ast).not.toBeNull();
    expect(result.errors).toHaveLength(0);
  });

  it('handles unbalanced parenthesis with error recovery', () => {
    const result = parse('(ab');
    expect(result.ast).not.toBeNull(); // partial AST
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Unbalanced');
  });

  it('parses epsilon', () => {
    const result = parse('ε');
    expect(result.ast).not.toBeNull();
    expect(result.ast!.type).toBe('epsilon');
  });

  it('parses empty set', () => {
    const result = parse('∅');
    expect(result.ast).not.toBeNull();
    expect(result.ast!.type).toBe('empty');
  });
});

describe('Thompson\'s Construction (NFA)', () => {
  it('builds NFA with exactly 1 start and 1 accept state', () => {
    const { nfa } = pipeline('a|b');
    expect(nfa.acceptStates.size).toBe(1);
    expect(typeof nfa.startState).toBe('string');
  });

  it('NFA for literal has correct alphabet', () => {
    const { nfa } = pipeline('a');
    expect(nfa.alphabet.has('a')).toBe(true);
  });
});

describe('Epsilon Cleanup — no redundant consecutive ε-chains', () => {
  it('(a|b)* has fewer states after cleanup (< 8)', () => {
    const { nfa } = pipeline('(a|b)*');
    // Standard Thompson produces 8 states; cleanup should reduce this
    expect(nfa.states.size).toBeLessThan(8);
  });

  it('no pass-through states in (a|b)* NFA', () => {
    const { nfa } = pipeline('(a|b)*');
    // A pass-through state has ONLY ε-in and ONLY ε-out and is not start/accept
    for (const state of nfa.states) {
      if (state === nfa.startState || nfa.acceptStates.has(state)) continue;

      // Check outgoing
      const outMap = nfa.transitions.get(state);
      if (!outMap) continue;
      const allOutEps = [...outMap.keys()].every(sym => sym === '');
      if (!allOutEps) continue;

      // Check incoming
      let allInEps = true;
      for (const [src, srcMap] of nfa.transitions) {
        if (src === state) continue;
        for (const [sym, tos] of srcMap) {
          if (tos.has(state) && sym !== '') { allInEps = false; break; }
        }
        if (!allInEps) break;
      }

      // If both all-in-eps and all-out-eps, this is a pass-through — should not exist
      expect(allOutEps && allInEps).toBe(false);
    }
  });

  it('(a|b)* still accepts correct language after cleanup', () => {
    expect(accepts('(a|b)*', '')).toBe(true);
    expect(accepts('(a|b)*', 'a')).toBe(true);
    expect(accepts('(a|b)*', 'b')).toBe(true);
    expect(accepts('(a|b)*', 'ab')).toBe(true);
    expect(accepts('(a|b)*', 'aabba')).toBe(true);
    expect(accepts('(a|b)*', 'bbbbb')).toBe(true);
  });

  it('a*b* cleanup preserves semantics', () => {
    expect(accepts('a*b*', '')).toBe(true);
    expect(accepts('a*b*', 'aabb')).toBe(true);
    expect(accepts('a*b*', 'ba')).toBe(false);
  });

  it('(a*)* cleanup reduces states and preserves semantics', () => {
    const { nfa } = pipeline('(a*)*');
    // Nested star should still be reduced
    expect(nfa.states.size).toBeLessThanOrEqual(6);
    expect(accepts('(a*)*', '')).toBe(true);
    expect(accepts('(a*)*', 'aaa')).toBe(true);
  });
});

describe('Subset Construction (DFA)', () => {
  it('DFA has no epsilon transitions', () => {
    const { dfa } = pipeline('(a|b)*abb');
    for (const [, transMap] of dfa.transitions) {
      expect(transMap.has('')).toBe(false);
    }
  });

  it('DFA transition function is total (every state has transition for every symbol)', () => {
    const { dfa } = pipeline('a*b*');
    for (const state of dfa.states) {
      const transMap = dfa.transitions.get(state);
      expect(transMap).toBeDefined();
      for (const sym of dfa.alphabet) {
        expect(transMap!.has(sym)).toBe(true);
      }
    }
  });
});

describe('Epsilon Closure', () => {
  it('computes ε-closure correctly', () => {
    const { nfa } = pipeline('a|b');
    const closure = epsilonClosure(nfa, new Set([nfa.startState]));
    // Start state should reach at least itself + states reachable via ε
    expect(closure.size).toBeGreaterThanOrEqual(1);
    expect(closure.has(nfa.startState)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// THE 10 STANDARD TEST CASES
// ═══════════════════════════════════════════════════════════

describe('Test Case 1: Even number of a\'s', () => {
  // Language: strings over {a,b} with even number of a's
  // Regex: (b|ab*a)*  — or equivalently (aa|b)*
  const regex = '(b|ab*a)*';

  it('accepts strings with even a-count', () => {
    expect(accepts(regex, '')).toBe(true);      // 0 a's (even)
    expect(accepts(regex, 'b')).toBe(true);     // 0 a's
    expect(accepts(regex, 'aa')).toBe(true);    // 2 a's
    expect(accepts(regex, 'bab')).toBe(false);  // 1 a (odd)
    expect(accepts(regex, 'aab')).toBe(true);   // 2 a's
    expect(accepts(regex, 'bba')).toBe(false);  // 1 a (odd)
    expect(accepts(regex, 'abba')).toBe(true);  // 2 a's
  });
});

describe('Test Case 2: Strings ending in ab', () => {
  const regex = '(a|b)*ab';

  it('accepts strings ending in ab', () => {
    expect(accepts(regex, 'ab')).toBe(true);
    expect(accepts(regex, 'aab')).toBe(true);
    expect(accepts(regex, 'bab')).toBe(true);
    expect(accepts(regex, 'aabb')).toBe(false);
    expect(accepts(regex, '')).toBe(false);
    expect(accepts(regex, 'a')).toBe(false);
    expect(accepts(regex, 'ba')).toBe(false);
  });
});

describe('Test Case 3: (a|b)* — all strings over {a,b}', () => {
  const regex = '(a|b)*';

  it('accepts all strings over {a,b}', () => {
    expect(accepts(regex, '')).toBe(true);
    expect(accepts(regex, 'a')).toBe(true);
    expect(accepts(regex, 'b')).toBe(true);
    expect(accepts(regex, 'ab')).toBe(true);
    expect(accepts(regex, 'aabba')).toBe(true);
    expect(accepts(regex, 'bbbbb')).toBe(true);
  });

  it('MinDFA is minimal (should have 1 state)', () => {
    const { minDfa } = pipeline(regex);
    expect(minDfa.minimizedCount).toBe(1);
  });
});

describe('Test Case 4: a*b*', () => {
  const regex = 'a*b*';

  it('accepts correct strings', () => {
    expect(accepts(regex, '')).toBe(true);
    expect(accepts(regex, 'a')).toBe(true);
    expect(accepts(regex, 'b')).toBe(true);
    expect(accepts(regex, 'aabb')).toBe(true);
    expect(accepts(regex, 'aaaa')).toBe(true);
    expect(accepts(regex, 'bbbb')).toBe(true);
    expect(accepts(regex, 'ba')).toBe(false);
    expect(accepts(regex, 'aba')).toBe(false);
  });
});

describe('Test Case 5: (a|b)*abb — classic textbook DFA', () => {
  const regex = '(a|b)*abb';

  it('accepts strings ending in abb', () => {
    expect(accepts(regex, 'abb')).toBe(true);
    expect(accepts(regex, 'aabb')).toBe(true);
    expect(accepts(regex, 'babb')).toBe(true);
    expect(accepts(regex, 'aababb')).toBe(true);
    expect(accepts(regex, 'ab')).toBe(false);
    expect(accepts(regex, '')).toBe(false);
    expect(accepts(regex, 'aba')).toBe(false);
  });
});

describe('Test Case 6: Empty language ∅', () => {
  it('rejects all strings', () => {
    const { minDfa } = pipeline('∅');
    expect(simulateAccepts(minDfa, '')).toBe(false);
    expect(simulateAccepts(minDfa, 'a')).toBe(false);
    expect(minDfa.acceptStates.size).toBe(0);
  });
});

describe('Test Case 7: ε (empty string language)', () => {
  it('accepts only the empty string', () => {
    const { minDfa } = pipeline('ε');
    expect(simulateAccepts(minDfa, '')).toBe(true);
    // No alphabet symbols means no other strings to test
    // Start state should be accepting
    expect(minDfa.acceptStates.has(minDfa.startState)).toBe(true);
  });
});

describe('Test Case 8: (a*)* nested stars — redundancy collapse', () => {
  it('is equivalent to a* (minimization collapses)', () => {
    const nested = pipeline('(a*)*');
    const simple = pipeline('a*');

    // Both should accept the same strings
    expect(simulateAccepts(nested.minDfa, '')).toBe(true);
    expect(simulateAccepts(nested.minDfa, 'a')).toBe(true);
    expect(simulateAccepts(nested.minDfa, 'aaa')).toBe(true);

    // Nested stars should minimize to same (or fewer) state count as simple a*
    expect(nested.minDfa.minimizedCount).toBeLessThanOrEqual(simple.minDfa.minimizedCount + 1);
  });

  it('minimizedCount < originalCount (some collapse happens in NFA→DFA→MinDFA)', () => {
    const { nfa, minDfa } = pipeline('(a*)*');
    expect(minDfa.minimizedCount).toBeLessThan(nfa.states.size);
  });
});

describe('Test Case 9: Alphabet mismatch equivalence — a* vs b*', () => {
  it('detects non-equivalence', () => {
    const pA = pipeline('a*');
    const pB = pipeline('b*');
    const result = checkEquivalence(pA.minDfa, pB.minDfa);

    expect(result.equivalent).toBe(false);
    expect(result.witness).not.toBeNull();
    // Witness should be either 'a' or 'b'
    expect(['a', 'b']).toContain(result.witness);
  });
});

describe('Test Case 10: Large RE (length > 30) — performance', () => {
  it('completes pipeline in < 200ms', () => {
    // Build a regex of length > 30
    const largeRegex = '(a|b|c|d|e|f|g|h)*abcdefghab(c|d)';
    expect(largeRegex.length).toBeGreaterThan(30);

    const start = performance.now();
    const { minDfa } = pipeline(largeRegex);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(minDfa.states.size).toBeGreaterThan(0);

    // Verify correctness
    expect(simulateAccepts(minDfa, 'abcdefghabc')).toBe(true);
    expect(simulateAccepts(minDfa, 'aabcdefghabd')).toBe(true);
    expect(simulateAccepts(minDfa, 'abcdefg')).toBe(false);
  });
});

describe('String Generator', () => {
  it('generates accepted strings in non-decreasing length order', () => {
    const { minDfa } = pipeline('a*b*');
    const accepted = generateAccepted(minDfa, { maxLength: 5, maxResults: 10 });

    // Check non-decreasing length
    for (let i = 1; i < accepted.length; i++) {
      expect(accepted[i].length).toBeGreaterThanOrEqual(accepted[i - 1].length);
    }

    // All generated strings should actually be accepted
    for (const s of accepted) {
      expect(simulateAccepts(minDfa, s)).toBe(true);
    }
  });

  it('generates rejected strings', () => {
    const { minDfa } = pipeline('a*b*');
    const rejected = generateRejected(minDfa, { maxLength: 4, maxResults: 5 });

    // All generated strings should actually be rejected
    for (const s of rejected) {
      expect(simulateAccepts(minDfa, s)).toBe(false);
    }
  });

  it('includes ε for nullable regex', () => {
    const { minDfa } = pipeline('a*');
    const accepted = generateAccepted(minDfa, { maxLength: 3, maxResults: 5 });
    expect(accepted).toContain('');
  });
});

describe('Equivalence Checker', () => {
  it('detects equivalent regexes: a*|a* ≡ a*', () => {
    const p1 = pipeline('a*|a*');
    const p2 = pipeline('a*');
    const result = checkEquivalence(p1.minDfa, p2.minDfa);
    expect(result.equivalent).toBe(true);
    expect(result.bijection).not.toBeNull();
  });

  it('detects non-equivalent regexes with witness', () => {
    const p1 = pipeline('a*');
    const p2 = pipeline('b*');
    const result = checkEquivalence(p1.minDfa, p2.minDfa);
    expect(result.equivalent).toBe(false);
    expect(result.witness).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// REFACTOR REGRESSION TESTS
// ═══════════════════════════════════════════════════════════

describe('ab* — DFA correctness and sink state', () => {
  const regex = 'ab*';

  it('accepts strings matching ab*', () => {
    expect(accepts(regex, 'a')).toBe(true);
    expect(accepts(regex, 'ab')).toBe(true);
    expect(accepts(regex, 'abb')).toBe(true);
    expect(accepts(regex, 'abbb')).toBe(true);
    expect(accepts(regex, 'abbbb')).toBe(true);
  });

  it('rejects strings NOT matching ab*', () => {
    expect(accepts(regex, '')).toBe(false);
    expect(accepts(regex, 'b')).toBe(false);
    expect(accepts(regex, 'ba')).toBe(false);
    expect(accepts(regex, 'aa')).toBe(false);    // ← crucial: second 'a' → sink
    expect(accepts(regex, 'aab')).toBe(false);
    expect(accepts(regex, 'aba')).toBe(false);   // 'a' after 'b' → sink
  });

  it('DFA has a non-accepting sink state for aa', () => {
    const { dfa } = pipeline(regex);
    // Simulate: start → 'a' → state1 → 'a' → state2
    const result = simulateTrace(dfa, 'aa');
    expect(result.kind).toBe('dfa');
    if (result.kind === 'dfa') {
      expect(result.accepted).toBe(false);
      expect(result.trace.length).toBe(3); // [start, after_a, after_aa]
      const sinkState = result.trace[2];
      // Sink state must NOT be accepting
      expect(dfa.acceptStates.has(sinkState)).toBe(false);
      // Sink state must loop to itself on all symbols (trap)
      for (const sym of dfa.alphabet) {
        expect(dfa.transitions.get(sinkState)?.get(sym)).toBe(sinkState);
      }
    }
  });
});

describe('DFA Validation — validateDFAInvariant', () => {
  it('passes for well-formed DFAs', () => {
    const { dfa } = pipeline('(a|b)*abb');
    const errors = validateDFAInvariant(dfa);
    expect(errors).toHaveLength(0);
  });

  it('passes for minimized DFAs', () => {
    const { minDfa } = pipeline('a*b*');
    const errors = validateDFAInvariant(minDfa);
    expect(errors).toHaveLength(0);
  });

  it('passes for single-state DFAs', () => {
    const { minDfa } = pipeline('(a|b)*');
    const errors = validateDFAInvariant(minDfa);
    expect(errors).toHaveLength(0);
  });

  it('detects missing transitions (malformed DFA)', () => {
    // Construct a deliberately broken DFA
    const brokenDfa = {
      states: new Set(['s0', 's1']),
      alphabet: new Set(['a', 'b']),
      transitions: new Map([
        ['s0', new Map([['a', 's1']])],  // missing 'b' transition for s0
        ['s1', new Map([['a', 's1'], ['b', 's0']])],
      ]),
      startState: 's0',
      acceptStates: new Set(['s1']),
    };
    const errors = validateDFAInvariant(brokenDfa);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.kind === 'missing_transition')).toBe(true);
  });

  it('detects start state not in Q', () => {
    const brokenDfa = {
      states: new Set(['s0']),
      alphabet: new Set(['a']),
      transitions: new Map([['s0', new Map([['a', 's0']])]]),
      startState: 'NONEXISTENT',
      acceptStates: new Set<string>(),
    };
    const errors = validateDFAInvariant(brokenDfa);
    expect(errors.some(e => e.kind === 'start_not_in_Q')).toBe(true);
  });
});

describe('NFA Trace — simulateNFATrace', () => {
  it('returns nfa-kind trace with ε-closure expansion', () => {
    const { nfa } = pipeline('a|b');
    const result = simulateNFATrace(nfa, 'a');
    expect(result.kind).toBe('nfa');
    if (result.kind === 'nfa') {
      expect(result.accepted).toBe(true);
      // Trace should have 2 entries: initial ε-closure, then after 'a'
      expect(result.trace.length).toBe(2);
      // Initial ε-closure must contain the start state
      expect(result.trace[0].has(nfa.startState)).toBe(true);
      // Final state-set must contain an accept state
      const finalSet = result.trace[1];
      let hasAccept = false;
      for (const s of finalSet) {
        if (nfa.acceptStates.has(s)) { hasAccept = true; break; }
      }
      expect(hasAccept).toBe(true);
    }
  });

  it('rejects string not in NFA language', () => {
    const { nfa } = pipeline('a');
    const result = simulateNFATrace(nfa, 'b');
    expect(result.kind).toBe('nfa');
    if (result.kind === 'nfa') {
      expect(result.accepted).toBe(false);
    }
  });

  it('handles ε-only NFA correctly', () => {
    const { nfa } = pipeline('ε');
    const result = simulateNFATrace(nfa, '');
    expect(result.kind).toBe('nfa');
    if (result.kind === 'nfa') {
      expect(result.accepted).toBe(true);
      expect(result.trace.length).toBe(1); // only the initial ε-closure
    }
  });
});

describe('State-ID Synchronization', () => {
  it('DFA trace uses d-prefixed states', () => {
    const { dfa } = pipeline('ab*');
    const result = simulateTrace(dfa, 'ab');
    expect(result.kind).toBe('dfa');
    if (result.kind === 'dfa') {
      for (const stateId of result.trace) {
        expect(stateId.startsWith('d')).toBe(true);
      }
    }
  });

  it('MinDFA trace uses m-prefixed states', () => {
    const { minDfa } = pipeline('ab*');
    const result = simulateTrace(minDfa, 'ab');
    expect(result.kind).toBe('dfa');
    if (result.kind === 'dfa') {
      for (const stateId of result.trace) {
        expect(stateId.startsWith('m')).toBe(true);
      }
    }
  });

  it('NFA trace uses q-prefixed states', () => {
    const { nfa } = pipeline('a|b');
    const result = simulateNFATrace(nfa, 'a');
    expect(result.kind).toBe('nfa');
    if (result.kind === 'nfa') {
      for (const stateSet of result.trace) {
        for (const stateId of stateSet) {
          expect(stateId.startsWith('q')).toBe(true);
        }
      }
    }
  });

  it('DFA and MinDFA agree on acceptance for same input', () => {
    const { dfa, minDfa } = pipeline('(a|b)*abb');
    const testStrings = ['abb', 'aabb', 'babb', 'ab', '', 'aba', 'aa'];
    for (const s of testStrings) {
      const dfaResult = simulateTrace(dfa, s);
      const minResult = simulateTrace(minDfa, s);
      expect(dfaResult.kind).toBe('dfa');
      expect(minResult.kind).toBe('dfa');
      if (dfaResult.kind === 'dfa' && minResult.kind === 'dfa') {
        expect(dfaResult.accepted).toBe(minResult.accepted);
      }
    }
  });
});

describe('generateAccepted — breadth-limited BFS', () => {
  it('generates multiple accepted strings of varying lengths for ab*', () => {
    const { minDfa } = pipeline('ab*');
    const accepted = generateAccepted(minDfa, { maxLength: 5, maxResults: 5 });
    // Should include 'a' (length 1) and longer strings
    expect(accepted).toContain('a');
    expect(accepted.length).toBeGreaterThanOrEqual(3);
    // All should be accepted
    for (const s of accepted) {
      expect(simulateAccepts(minDfa, s)).toBe(true);
    }
    // Should have strings of different lengths
    const lengths = new Set(accepted.map(s => s.length));
    expect(lengths.size).toBeGreaterThanOrEqual(2);
  });

  it('generates ε for nullable regex', () => {
    const { minDfa } = pipeline('a*');
    const accepted = generateAccepted(minDfa, { maxLength: 3, maxResults: 5 });
    expect(accepted).toContain('');
  });
});
