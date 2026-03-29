/**
 * EquivalenceChecker.ts — Check if two MinDFAs recognize the same language.
 *
 * **Algorithm:**
 *
 * Phase 1 — Bijection Search:
 *   BFS from (a.q₀, b.q₀), expanding state pairs.
 *   Two states are "compatible" iff:
 *     (i)  both are accept or both are non-accept
 *     (ii) for every symbol c ∈ Σ, δ_A(qA, c) and δ_B(qB, c) map to
 *          a previously paired or newly pairable state
 *   If BFS completes without contradiction → equivalent (bijection found).
 *
 * Phase 2 — Witness Generation (if not equivalent):
 *   Build the product automaton A × B where:
 *     States: Q_A × Q_B
 *     Accept: (F_A × Q_B) ∪ (Q_A × F_B) \ (F_A × F_B)
 *             i.e., symmetric difference: exactly one of the pair is accepting
 *   BFS from (a.q₀, b.q₀), return path labels to first accept state.
 *   This yields the shortest word in L(A) △ L(B).
 *
 * ZERO React imports. Pure TypeScript.
 */

import type { MinDFA, EquivalenceResult, StateId } from '../types/automata';

/**
 * Check whether two MinDFAs are equivalent (recognize the same language).
 *
 * @param a - First MinDFA
 * @param b - Second MinDFA
 * @returns EquivalenceResult with bijection (if equivalent) or witness (if not)
 */
export function checkEquivalence(a: MinDFA, b: MinDFA): EquivalenceResult {
  // ── Phase 1: Attempt bijection via BFS ──
  const bijection = new Map<StateId, StateId>();
  const reverseBijection = new Map<StateId, StateId>();
  const queue: Array<[StateId, StateId]> = [[a.startState, b.startState]];
  let equivalent = true;

  // Combined alphabet
  const alphabet = new Set([...a.alphabet, ...b.alphabet]);

  bijection.set(a.startState, b.startState);
  reverseBijection.set(b.startState, a.startState);

  while (queue.length > 0) {
    const [qa, qb] = queue.shift()!;

    // Check accept-status compatibility:
    // Both must be accept or both non-accept
    const aAccepts = a.acceptStates.has(qa);
    const bAccepts = b.acceptStates.has(qb);
    if (aAccepts !== bAccepts) {
      equivalent = false;
      break;
    }

    // Check transitions for every symbol
    for (const c of alphabet) {
      const targetA = a.transitions.get(qa)?.get(c);
      const targetB = b.transitions.get(qb)?.get(c);

      // Handle missing transitions (treat as implicit trap)
      if (targetA === undefined && targetB === undefined) continue;
      if (targetA === undefined || targetB === undefined) {
        equivalent = false;
        break;
      }

      // Check if this pair is consistent with existing bijection
      if (bijection.has(targetA)) {
        if (bijection.get(targetA) !== targetB) {
          equivalent = false;
          break;
        }
      } else if (reverseBijection.has(targetB)) {
        if (reverseBijection.get(targetB) !== targetA) {
          equivalent = false;
          break;
        }
      } else {
        // New pair — add to bijection and enqueue
        bijection.set(targetA, targetB);
        reverseBijection.set(targetB, targetA);
        queue.push([targetA, targetB]);
      }
    }

    if (!equivalent) break;
  }

  if (equivalent) {
    return { equivalent: true, bijection, witness: null };
  }

  // ── Phase 2: Find witness (shortest word in symmetric difference) ──
  const witness = findWitness(a, b, alphabet);
  return { equivalent: false, bijection: null, witness };
}

/**
 * Find the shortest witness string in L(A) △ L(B) (symmetric difference).
 *
 * Uses BFS on the product automaton A × B.
 * Accept states of the product: one machine accepts, the other rejects.
 *
 * @returns The shortest distinguishing string, or null if none found.
 */
function findWitness(
  a: MinDFA,
  b: MinDFA,
  alphabet: Set<string>
): string | null {
  // BFS on product automaton
  type ProductState = string; // "qa|qb"
  const makeKey = (qa: StateId, qb: StateId): ProductState => `${qa}|${qb}`;

  const startKey = makeKey(a.startState, b.startState);

  // Check if start state itself is in the symmetric difference
  const startAAccepts = a.acceptStates.has(a.startState);
  const startBAccepts = b.acceptStates.has(b.startState);
  if (startAAccepts !== startBAccepts) {
    return ''; // ε is the witness
  }

  const visited = new Set<ProductState>([startKey]);
  const queue: Array<{ qa: StateId; qb: StateId; path: string }> = [
    { qa: a.startState, qb: b.startState, path: '' },
  ];

  while (queue.length > 0) {
    const { qa, qb, path } = queue.shift()!;

    for (const c of alphabet) {
      const nextA = a.transitions.get(qa)?.get(c);
      const nextB = b.transitions.get(qb)?.get(c);

      // Skip if both have no transition (both go to implicit dead state)
      if (nextA === undefined && nextB === undefined) continue;

      // Use a sentinel for missing transitions
      const effectiveA = nextA ?? '__dead_a__';
      const effectiveB = nextB ?? '__dead_b__';
      const key = makeKey(effectiveA, effectiveB);
      const newPath = path + c;

      if (visited.has(key)) continue;
      visited.add(key);

      // Check symmetric difference: exactly one accepts
      const aAccepts = nextA !== undefined && a.acceptStates.has(nextA);
      const bAccepts = nextB !== undefined && b.acceptStates.has(nextB);

      if (aAccepts !== bAccepts) {
        return newPath; // Found the shortest witness
      }

      // Only enqueue if we have real states to explore
      if (nextA !== undefined && nextB !== undefined) {
        queue.push({ qa: nextA, qb: nextB, path: newPath });
      } else if (nextA !== undefined) {
        // B is in dead state — any accept reachable from A is a witness
        // We still need to BFS to find shortest path to A's accept
        queue.push({ qa: nextA, qb: effectiveB as StateId, path: newPath });
      } else if (nextB !== undefined) {
        queue.push({ qa: effectiveA as StateId, qb: nextB, path: newPath });
      }
    }
  }

  // Shouldn't reach here for truly non-equivalent MinDFAs, but guard
  return null;
}
