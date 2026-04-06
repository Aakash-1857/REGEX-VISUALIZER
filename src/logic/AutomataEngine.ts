/**
 * AutomataEngine.ts — Core automata construction and transformation algorithms.
 *
 * This module implements three fundamental algorithms of formal language theory:
 *
 * 1. Thompson's Construction: RegexNode AST → NFA
 *    Reference: Ken Thompson, "Programming Techniques: Regular expression search algorithm" (1968)
 *
 * 2. Subset Construction (Powerset Construction): NFA → DFA
 *    Reference: Michael Rabin & Dana Scott, "Finite Automata and Their Decision Problems" (1959)
 *
 * 3. Hopcroft's Algorithm: DFA → MinDFA
 *    Reference: John Hopcroft, "An n log n algorithm for minimizing states in a finite automaton" (1971)
 *
 * ZERO React imports. Pure TypeScript. Fully unit-testable.
 */

import type { RegexNode, NFA, DFA, MinDFA, StateId } from '../types/automata';

// ═══════════════════════════════════════════════════════════
// §1. State ID Generation
// ═══════════════════════════════════════════════════════════

let stateCounter = 0;

/** Reset the global state counter. Useful for testing determinism. */
export function resetStateCounter(): void {
  stateCounter = 0;
}

/** Generate a unique state ID with an optional prefix. */
function newState(prefix: string = 'q'): StateId {
  return `${prefix}${stateCounter++}`;
}

// ═══════════════════════════════════════════════════════════
// §2. NFA Fragment (internal representation for Thompson's)
// ═══════════════════════════════════════════════════════════

/**
 * An NFA fragment has exactly one start state and one accept state.
 * Thompson's Construction builds the full NFA by composing fragments.
 */
interface NFAFragment {
  states: Set<StateId>;
  alphabet: Set<string>;
  transitions: Map<StateId, Map<string, Set<StateId>>>;
  start: StateId;
  accept: StateId;
}

/** Add a transition δ(from, symbol) → to in the transition map. */
function addTransition(
  transitions: Map<StateId, Map<string, Set<StateId>>>,
  from: StateId,
  symbol: string,
  to: StateId
): void {
  if (!transitions.has(from)) {
    transitions.set(from, new Map());
  }
  const fromMap = transitions.get(from)!;
  if (!fromMap.has(symbol)) {
    fromMap.set(symbol, new Set());
  }
  fromMap.get(symbol)!.add(to);
}

// ═══════════════════════════════════════════════════════════
// §3. Thompson's Construction: AST → NFA
// ═══════════════════════════════════════════════════════════

/**
 * Convert a RegexNode AST into an NFA using Thompson's Construction.
 *
 * **Algorithm (structural recursion over the AST):**
 *
 * Each AST node produces an NFA fragment with exactly 1 start state
 * and 1 accept state. Fragments are connected via ε-transitions.
 *
 * - **Literal 'a':** q₀ →ᵃ q₁
 * - **Epsilon:**      q₀ →ᵉ q₁
 * - **Empty set:**    q₀        q₁    (no transitions; L = ∅)
 * - **Union r|s:**    new q₀ →ᵉ r.start, s.start;
 *                     r.accept, s.accept →ᵉ new q₁
 * - **Concat rs:**    r.accept →ᵉ s.start;
 *                     fragment start=r.start, accept=s.accept
 * - **Star r*:**      new q₀ →ᵉ r.start, new q₁;
 *                     r.accept →ᵉ r.start, new q₁
 *
 * @param ast - The parsed regex AST.
 * @returns A complete NFA.
 */
export function toNFA(ast: RegexNode): NFA {
  resetStateCounter();
  const fragment = buildFragment(ast);
  const cleaned = eliminateRedundantEpsilons(fragment);
  return {
    states: cleaned.states,
    alphabet: cleaned.alphabet,
    transitions: cleaned.transitions,
    startState: cleaned.start,
    acceptStates: new Set([cleaned.accept]),
  };
}

/**
 * Recursively build an NFA fragment from an AST node.
 * Each case follows the Thompson's Construction rules exactly.
 */
function buildFragment(node: RegexNode): NFAFragment {
  switch (node.type) {
    case 'literal':
      return buildLiteral(node.char);
    case 'epsilon':
      return buildEpsilon();
    case 'empty':
      return buildEmpty();
    case 'union':
      return buildUnion(buildFragment(node.left), buildFragment(node.right));
    case 'concat':
      return buildConcat(buildFragment(node.left), buildFragment(node.right));
    case 'star':
      return buildStar(buildFragment(node.child));
  }
}

/**
 * Literal fragment: q₀ →ᵃ q₁
 *
 * Creates two states connected by a single transition on character `ch`.
 */
function buildLiteral(ch: string): NFAFragment {
  const start = newState();
  const accept = newState();
  const states = new Set([start, accept]);
  const transitions = new Map<StateId, Map<string, Set<StateId>>>();
  const alphabet = new Set([ch]);

  addTransition(transitions, start, ch, accept);

  return { states, alphabet, transitions, start, accept };
}

/**
 * Epsilon fragment: q₀ →ᵉ q₁
 *
 * L(ε) = {ε}. Two states connected by an ε-transition.
 */
function buildEpsilon(): NFAFragment {
  const start = newState();
  const accept = newState();
  const states = new Set([start, accept]);
  const transitions = new Map<StateId, Map<string, Set<StateId>>>();

  addTransition(transitions, start, '', accept);

  return { states, alphabet: new Set(), transitions, start, accept };
}

/**
 * Empty set fragment: q₀    q₁
 *
 * L(∅) = ∅. Two states with NO transitions. No string reaches accept.
 */
function buildEmpty(): NFAFragment {
  const start = newState();
  const accept = newState();
  return {
    states: new Set([start, accept]),
    alphabet: new Set(),
    transitions: new Map(),
    start,
    accept,
  };
}

/**
 * Union fragment: r₁ | r₂
 *
 *        ε→ [frag1] →ε
 * q₀ →<                 >→ q₁
 *        ε→ [frag2] →ε
 *
 * L(r₁|r₂) = L(r₁) ∪ L(r₂)
 */
function buildUnion(frag1: NFAFragment, frag2: NFAFragment): NFAFragment {
  const start = newState();
  const accept = newState();

  // Merge all states
  const states = new Set([start, accept, ...frag1.states, ...frag2.states]);
  const alphabet = new Set([...frag1.alphabet, ...frag2.alphabet]);

  // Merge all transitions
  const transitions = new Map<StateId, Map<string, Set<StateId>>>();
  for (const [from, map] of frag1.transitions) {
    for (const [sym, tos] of map) {
      for (const to of tos) addTransition(transitions, from, sym, to);
    }
  }
  for (const [from, map] of frag2.transitions) {
    for (const [sym, tos] of map) {
      for (const to of tos) addTransition(transitions, from, sym, to);
    }
  }

  // Connect: q₀ →ε frag1.start, frag2.start
  addTransition(transitions, start, '', frag1.start);
  addTransition(transitions, start, '', frag2.start);

  // Connect: frag1.accept, frag2.accept →ε q₁
  addTransition(transitions, frag1.accept, '', accept);
  addTransition(transitions, frag2.accept, '', accept);

  return { states, alphabet, transitions, start, accept };
}

/**
 * Concatenation fragment: r₁r₂
 *
 * [frag1] →ε [frag2]
 *
 * start = frag1.start, accept = frag2.accept
 * L(r₁r₂) = { xy : x ∈ L(r₁), y ∈ L(r₂) }
 */
function buildConcat(frag1: NFAFragment, frag2: NFAFragment): NFAFragment {
  const states = new Set([...frag1.states, ...frag2.states]);
  const alphabet = new Set([...frag1.alphabet, ...frag2.alphabet]);

  const transitions = new Map<StateId, Map<string, Set<StateId>>>();
  for (const [from, map] of frag1.transitions) {
    for (const [sym, tos] of map) {
      for (const to of tos) addTransition(transitions, from, sym, to);
    }
  }
  for (const [from, map] of frag2.transitions) {
    for (const [sym, tos] of map) {
      for (const to of tos) addTransition(transitions, from, sym, to);
    }
  }

  // Connect: frag1.accept →ε frag2.start
  addTransition(transitions, frag1.accept, '', frag2.start);

  return { states, alphabet, transitions, start: frag1.start, accept: frag2.accept };
}

/**
 * Kleene star fragment: r*
 *
 *     ε→ [frag] →ε
 * q₀ →<    ↑←ε←↓   >→ q₁
 *     ε─────────────→
 *
 * L(r*) = {ε} ∪ L(r) ∪ L(r)² ∪ L(r)³ ∪ ...
 */
function buildStar(frag: NFAFragment): NFAFragment {
  const start = newState();
  const accept = newState();

  const states = new Set([start, accept, ...frag.states]);
  const alphabet = new Set([...frag.alphabet]);

  const transitions = new Map<StateId, Map<string, Set<StateId>>>();
  for (const [from, map] of frag.transitions) {
    for (const [sym, tos] of map) {
      for (const to of tos) addTransition(transitions, from, sym, to);
    }
  }

  // q₀ →ε frag.start (enter the loop)
  addTransition(transitions, start, '', frag.start);
  // q₀ →ε q₁ (skip — accept ε)
  addTransition(transitions, start, '', accept);
  // frag.accept →ε frag.start (repeat)
  addTransition(transitions, frag.accept, '', frag.start);
  // frag.accept →ε q₁ (exit)
  addTransition(transitions, frag.accept, '', accept);

  return { states, alphabet, transitions, start, accept };
}

// ═══════════════════════════════════════════════════════════
// §3b. Redundant ε-Transition Cleanup
// ═══════════════════════════════════════════════════════════

/**
 * Eliminate redundant consecutive ε-transitions from an NFA fragment.
 *
 * **Algorithm:**
 * A state is a "pass-through" candidate if:
 *   1. It is NOT the fragment's start or accept state
 *   2. ALL incoming transitions are ε (no symbol arrives at this state)
 *   3. ALL outgoing transitions are ε (no symbol leaves this state)
 *
 * For each such state q_mid:
 *   - For every q_src →ε→ q_mid and q_mid →ε→ q_dst:
 *     add a bypass edge q_src →ε→ q_dst
 *   - Remove q_mid and all its transitions
 *
 * This pass is applied iteratively until no more candidates exist.
 * It is semantics-preserving: the ε-closure of every remaining state
 * is unchanged, so the recognized language is identical.
 */
function eliminateRedundantEpsilons(frag: NFAFragment): NFAFragment {
  const states = new Set(frag.states);
  const transitions = new Map<StateId, Map<string, Set<StateId>>>();

  // Deep-copy transitions
  for (const [from, map] of frag.transitions) {
    const newMap = new Map<string, Set<StateId>>();
    for (const [sym, tos] of map) {
      newMap.set(sym, new Set(tos));
    }
    transitions.set(from, newMap);
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const qMid of [...states]) {
      // Rule 1: never remove start or accept
      if (qMid === frag.start || qMid === frag.accept) continue;

      // Rule 3: all outgoing transitions must be ε only
      const outMap = transitions.get(qMid);
      if (!outMap) continue; // no outgoing transitions at all — isolated, skip
      let allOutEpsilon = true;
      for (const sym of outMap.keys()) {
        if (sym !== '') { allOutEpsilon = false; break; }
      }
      if (!allOutEpsilon) continue;

      // Rule 2: all incoming transitions must be ε only
      let allInEpsilon = true;
      const incomingSources: StateId[] = [];
      for (const [src, srcMap] of transitions) {
        if (src === qMid) continue;
        for (const [sym, tos] of srcMap) {
          if (tos.has(qMid)) {
            if (sym !== '') { allInEpsilon = false; break; }
            incomingSources.push(src);
          }
        }
        if (!allInEpsilon) break;
      }
      if (!allInEpsilon) continue;

      // qMid is a pass-through state — bypass it
      const epsilonTargets = outMap.get('') ?? new Set();

      // Add bypass edges: q_src →ε→ q_dst for each (src, dst) pair
      for (const src of incomingSources) {
        for (const dst of epsilonTargets) {
          if (dst === qMid) continue; // avoid self-references to removed node
          addTransition(transitions, src, '', dst);
        }
        // Remove the edge src →ε→ qMid
        const srcEps = transitions.get(src)?.get('');
        if (srcEps) {
          srcEps.delete(qMid);
          if (srcEps.size === 0) transitions.get(src)!.delete('');
        }
      }

      // Remove qMid entirely
      transitions.delete(qMid);
      states.delete(qMid);
      changed = true;
    }
  }

  return {
    states,
    alphabet: frag.alphabet,
    transitions,
    start: frag.start,
    accept: frag.accept,
  };
}

// ═══════════════════════════════════════════════════════════
// §4. ε-Closure
// ═══════════════════════════════════════════════════════════

/**
 * Compute the ε-closure of a set of NFA states.
 *
 * **Algorithm:** BFS/DFS over ε-labeled edges (symbol = '').
 *
 * ε-CLOSURE(T) = T ∪ { q : q is reachable from some state in T
 *                        via one or more ε-transitions }
 *
 * @param nfa - The NFA.
 * @param states - The initial set of states.
 * @returns The ε-closure as a new Set.
 */
export function epsilonClosure(nfa: NFA, states: Set<StateId>): Set<StateId> {
  const closure = new Set(states);
  const stack = [...states];

  while (stack.length > 0) {
    const state = stack.pop()!;
    const epsilonTargets = nfa.transitions.get(state)?.get('');
    if (epsilonTargets) {
      for (const target of epsilonTargets) {
        if (!closure.has(target)) {
          closure.add(target);
          stack.push(target);
        }
      }
    }
  }

  return closure;
}

// ═══════════════════════════════════════════════════════════
// §5. Subset Construction (Powerset): NFA → DFA
// ═══════════════════════════════════════════════════════════

/**
 * Convert an NFA to an equivalent DFA using the Subset Construction.
 *
 * **Algorithm (Rabin-Scott, 1959):**
 *
 * Each DFA state represents a set of NFA states (an element of P(Q_NFA)).
 *
 * 1. Start state of DFA = ε-CLOSURE({q₀_NFA})
 * 2. For each unmarked DFA state T and each symbol a ∈ Σ:
 *    - U = ε-CLOSURE( ∪_{q∈T} δ_NFA(q, a) )
 *    - If U is new, add it as a new DFA state
 *    - δ_DFA(T, a) = U
 * 3. DFA accept states = any DFA state containing an NFA accept state
 * 4. Add explicit dead/trap state for any missing transitions
 *
 * @param nfa - The NFA to convert.
 * @returns An equivalent DFA with total transition function.
 */
export function toDFA(nfa: NFA): DFA {
  const alphabet = new Set(nfa.alphabet);
  // Remove ε from alphabet if present (it's not a real symbol)
  alphabet.delete('');

  // DFA state = frozen set of NFA states, encoded as sorted comma-joined string
  const startClosure = epsilonClosure(nfa, new Set([nfa.startState]));
  const startKey = stateSetKey(startClosure);

  // Map from DFA state key → Set<StateId> (the NFA states it represents)
  const dfaStateMap = new Map<string, Set<StateId>>();
  dfaStateMap.set(startKey, startClosure);

  // BFS worklist
  const worklist: string[] = [startKey];
  const visited = new Set<string>([startKey]);

  // DFA transitions: key → Map<symbol, key>
  const dfaTransitions = new Map<string, Map<string, string>>();

  while (worklist.length > 0) {
    const currentKey = worklist.shift()!;
    const currentNFAStates = dfaStateMap.get(currentKey)!;

    const transMap = new Map<string, string>();

    for (const symbol of alphabet) {
      // Compute move(T, a) = ∪_{q∈T} δ_NFA(q, a)
      const moved = new Set<StateId>();
      for (const nfaState of currentNFAStates) {
        const targets = nfa.transitions.get(nfaState)?.get(symbol);
        if (targets) {
          for (const t of targets) moved.add(t);
        }
      }

      // Compute ε-CLOSURE(move(T, a))
      const closure = epsilonClosure(nfa, moved);
      const closureKey = stateSetKey(closure);

      if (closure.size > 0) {
        if (!visited.has(closureKey)) {
          visited.add(closureKey);
          dfaStateMap.set(closureKey, closure);
          worklist.push(closureKey);
        }
        transMap.set(symbol, closureKey);
      }
      // If closure is empty, we'll add trap state later
    }

    dfaTransitions.set(currentKey, transMap);
  }

  // ── Add explicit dead/trap state for missing transitions ──
  const trapKey = 'TRAP';
  let needsTrap = false;

  for (const [, transMap] of dfaTransitions) {
    for (const symbol of alphabet) {
      if (!transMap.has(symbol)) {
        transMap.set(symbol, trapKey);
        needsTrap = true;
      }
    }
  }

  if (needsTrap) {
    dfaStateMap.set(trapKey, new Set());
    const trapTrans = new Map<string, string>();
    for (const symbol of alphabet) {
      trapTrans.set(symbol, trapKey); // trap loops to itself
    }
    dfaTransitions.set(trapKey, trapTrans);
  }

  // ── Rename DFA states to canonical IDs: d0, d1, d2, ... ──
  const keyToId = new Map<string, StateId>();
  let dfaIdCounter = 0;

  // Ensure start state gets d0
  keyToId.set(startKey, `d${dfaIdCounter++}`);
  for (const key of dfaStateMap.keys()) {
    if (!keyToId.has(key)) {
      keyToId.set(key, `d${dfaIdCounter++}`);
    }
  }

  // Build final DFA
  const states = new Set<StateId>();
  const transitions = new Map<StateId, Map<string, StateId>>();
  const acceptStates = new Set<StateId>();

  for (const [key, nfaStates] of dfaStateMap) {
    const dfaId = keyToId.get(key)!;
    states.add(dfaId);

    // Check if this DFA state contains any NFA accept state
    for (const nfaState of nfaStates) {
      if (nfa.acceptStates.has(nfaState)) {
        acceptStates.add(dfaId);
        break;
      }
    }

    // Map transitions
    const keyTrans = dfaTransitions.get(key);
    if (keyTrans) {
      const idTrans = new Map<string, StateId>();
      for (const [sym, targetKey] of keyTrans) {
        idTrans.set(sym, keyToId.get(targetKey)!);
      }
      transitions.set(dfaId, idTrans);
    }
  }

  return {
    states,
    alphabet,
    transitions,
    startState: keyToId.get(startKey)!,
    acceptStates,
  };
}

/** Create a canonical string key for a set of states (sorted, comma-joined). */
function stateSetKey(states: Set<StateId>): string {
  return [...states].sort().join(',');
}

// ═══════════════════════════════════════════════════════════
// §6. Hopcroft's Algorithm: DFA → MinDFA
// ═══════════════════════════════════════════════════════════

/**
 * Minimize a DFA using Hopcroft's Algorithm.
 *
 * **Algorithm (Hopcroft, 1971), O(n log n):**
 *
 * 1. Initial partition P = {F, Q \ F} where F = accept states
 * 2. Worklist W = {F}  (or whichever is smaller of F, Q\F)
 * 3. While W is non-empty:
 *    a. Remove a set A from W
 *    b. For each symbol c ∈ Σ:
 *       i.  X = { q ∈ Q : δ(q, c) ∈ A }  (states that transition into A on c)
 *       ii. For each set Y in P that intersects X but is not a subset of X:
 *           - Split Y into (Y ∩ X) and (Y \ X)
 *           - Replace Y in P with both halves
 *           - Update W accordingly
 * 4. Each equivalence class in P becomes one MinDFA state
 *
 * @param dfa - The DFA to minimize.
 * @returns A MinDFA with provenance information (partitionMap, mergedStates).
 */
export function minimize(dfa: DFA): MinDFA {
  const allStates = [...dfa.states];
  const alphabet = [...dfa.alphabet];

  // ── Step 1: Initial partition {F, Q\F} ──
  const acceptSet = new Set(dfa.acceptStates);
  const nonAcceptStates = allStates.filter(s => !acceptSet.has(s));
  const acceptArr = allStates.filter(s => acceptSet.has(s));

  // Partition is a list of state sets
  let partition: Set<StateId>[] = [];
  if (acceptArr.length > 0) partition.push(new Set(acceptArr));
  if (nonAcceptStates.length > 0) partition.push(new Set(nonAcceptStates));

  // Handle edge case: all states are accept or all are non-accept
  if (partition.length === 0) {
    partition = [new Set(allStates)];
  }

  // ── Step 2: Worklist ──
  const worklist: Set<StateId>[] = [];
  if (acceptArr.length > 0) worklist.push(new Set(acceptArr));
  if (nonAcceptStates.length > 0) worklist.push(new Set(nonAcceptStates));

  // ── Step 3: Refine until stable ──
  while (worklist.length > 0) {
    const A = worklist.pop()!;

    for (const c of alphabet) {
      // X = { q ∈ Q : δ(q, c) ∈ A }
      const X = new Set<StateId>();
      for (const state of allStates) {
        const target = dfa.transitions.get(state)?.get(c);
        if (target !== undefined && A.has(target)) {
          X.add(state);
        }
      }

      if (X.size === 0) continue;

      // For each set Y in the current partition...
      const newPartition: Set<StateId>[] = [];
      for (const Y of partition) {
        // Compute Y ∩ X and Y \ X
        const intersection = new Set<StateId>();
        const difference = new Set<StateId>();

        for (const s of Y) {
          if (X.has(s)) {
            intersection.add(s);
          } else {
            difference.add(s);
          }
        }

        // If Y intersects X but is not a subset of X → split
        if (intersection.size > 0 && difference.size > 0) {
          newPartition.push(intersection);
          newPartition.push(difference);

          // Update worklist: if Y is in W, replace with both halves;
          // otherwise add the smaller half
          const yInWorklist = worklist.findIndex(w => setsEqual(w, Y));
          if (yInWorklist >= 0) {
            worklist.splice(yInWorklist, 1);
            worklist.push(intersection);
            worklist.push(difference);
          } else {
            // Add the smaller half (Hopcroft's optimization)
            if (intersection.size <= difference.size) {
              worklist.push(intersection);
            } else {
              worklist.push(difference);
            }
          }
        } else {
          // Y is entirely inside or outside X — no split needed
          newPartition.push(Y);
        }
      }

      partition = newPartition;
    }
  }

  // ── Step 4: Build MinDFA from equivalence classes ──
  // Assign canonical IDs: m0, m1, m2, ...
  const partitionMap = new Map<StateId, StateId>();
  const mergedStates = new Map<StateId, Set<StateId>>();

  // Sort partition so start state's class is m0
  const startClassIndex = partition.findIndex(cls => cls.has(dfa.startState));
  if (startClassIndex > 0) {
    const temp = partition[0];
    partition[0] = partition[startClassIndex];
    partition[startClassIndex] = temp;
  }

  for (let i = 0; i < partition.length; i++) {
    const minId = `m${i}` as StateId;
    const cls = partition[i];
    mergedStates.set(minId, cls);
    for (const state of cls) {
      partitionMap.set(state, minId);
    }
  }

  // Build states, transitions, accept states
  const minStates = new Set<StateId>();
  const minTransitions = new Map<StateId, Map<string, StateId>>();
  const minAcceptStates = new Set<StateId>();

  for (let i = 0; i < partition.length; i++) {
    const minId = `m${i}` as StateId;
    minStates.add(minId);

    // Pick a representative from this class
    const representative = [...partition[i]][0];

    // Check accept
    if (dfa.acceptStates.has(representative)) {
      minAcceptStates.add(minId);
    }

    // Build transitions
    const trans = new Map<string, StateId>();
    for (const c of alphabet) {
      const target = dfa.transitions.get(representative)?.get(c);
      if (target !== undefined) {
        trans.set(c, partitionMap.get(target)!);
      }
    }
    minTransitions.set(minId, trans);
  }

  return {
    states: minStates,
    alphabet: dfa.alphabet,
    transitions: minTransitions,
    startState: partitionMap.get(dfa.startState)!,
    acceptStates: minAcceptStates,
    partitionMap,
    mergedStates,
    originalCount: dfa.states.size,
    minimizedCount: minStates.size,
  };
}

/** Check if two sets contain exactly the same elements. */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
