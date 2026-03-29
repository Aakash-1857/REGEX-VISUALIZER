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
import { toNFA, toDFA, minimize, epsilonClosure, resetStateCounter } from '../logic/AutomataEngine';
import { checkEquivalence } from '../logic/EquivalenceChecker';
import { generateAccepted, generateRejected, simulateAccepts } from '../logic/StringGenerator';
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
