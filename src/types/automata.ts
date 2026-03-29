/**
 * automata.ts — All shared type definitions for the Formal Language Laboratory.
 *
 * These types encode the mathematical objects of formal language theory:
 * regular expressions (as ASTs), NFAs, DFAs, minimized DFAs, and
 * equivalence results. Every interface mirrors its textbook definition.
 */

/** Unique identifier for an automaton state. */
export type StateId = string;

/** Pipeline visualization stages. */
export type PipelineStage = 'nfa' | 'dfa' | 'minDfa';

/** Application mode: single regex or comparison of two. */
export type AppMode = 'single' | 'comparison';

/**
 * AST node for a regular expression.
 *
 * Grammar (in decreasing precedence):
 *   Atom     ::= literal | '(' Union ')' | 'ε'
 *   Star     ::= Atom ('*' | '+' | '?')*
 *   Concat   ::= Star Star*
 *   Union    ::= Concat ('|' Concat)*
 */
export type RegexNode =
  | { type: 'literal'; char: string }
  | { type: 'union'; left: RegexNode; right: RegexNode }
  | { type: 'concat'; left: RegexNode; right: RegexNode }
  | { type: 'star'; child: RegexNode }
  | { type: 'epsilon' }
  | { type: 'empty' };

/** Error produced during regex parsing with source location. */
export interface ParseError {
  message: string;
  spanStart: number;
  spanEnd: number;
}

/** Result of parsing: partial AST (resilient) + any errors. */
export interface ParseResult {
  ast: RegexNode | null;
  errors: ParseError[];
}

/**
 * Non-deterministic Finite Automaton (NFA).
 *
 * Formally: N = (Q, Σ, δ, q₀, F)
 * where δ: Q × (Σ ∪ {ε}) → P(Q)
 *
 * ε-transitions are represented with the empty string '' as the symbol key.
 */
export interface NFA {
  states: Set<StateId>;
  alphabet: Set<string>;
  transitions: Map<StateId, Map<string, Set<StateId>>>;
  startState: StateId;
  acceptStates: Set<StateId>;
}

/**
 * Deterministic Finite Automaton (DFA).
 *
 * Formally: D = (Q, Σ, δ, q₀, F)
 * where δ: Q × Σ → Q  (total function)
 */
export interface DFA {
  states: Set<StateId>;
  alphabet: Set<string>;
  transitions: Map<StateId, Map<string, StateId>>;
  startState: StateId;
  acceptStates: Set<StateId>;
}

/**
 * Minimized DFA with provenance information.
 *
 * Extends DFA with:
 * - partitionMap: maps each original DFA state → its MinDFA representative
 * - mergedStates: maps each MinDFA state → set of DFA states it represents
 * - originalCount / minimizedCount: for the ReductionBadge
 */
export interface MinDFA extends DFA {
  partitionMap: Map<StateId, StateId>;
  mergedStates: Map<StateId, Set<StateId>>;
  originalCount: number;
  minimizedCount: number;
}

/**
 * Result of checking equivalence of two MinDFAs.
 *
 * If equivalent: bijection maps states of A to states of B.
 * If not: witness is the shortest string in L(A) △ L(B) (symmetric difference).
 */
export interface EquivalenceResult {
  equivalent: boolean;
  bijection: Map<StateId, StateId> | null;
  witness: string | null;
}

/**
 * Full application state managed by the reducer.
 */
export interface AutomataState {
  regexA: string;
  regexB: string;
  mode: AppMode;
  pipeline: { nfa: NFA | null; dfa: DFA | null; minDfa: MinDFA | null };
  pipelineB: { nfa: NFA | null; dfa: DFA | null; minDfa: MinDFA | null } | null;
  activeStage: PipelineStage;
  highlightedStates: Set<StateId>;
  equivalenceResult: EquivalenceResult | null;
  testString: string;
  testTrace: StateId[];
  testStatus: 'idle' | 'running' | 'accepted' | 'rejected';
  parseErrors: ParseError[];
  parseErrorsB: ParseError[];
}
