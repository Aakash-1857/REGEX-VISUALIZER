/**
 * GraphLayout.ts — BFS-distance-from-start layered graph layout.
 *
 * Produces (x, y) coordinates for each state in a Sugiyama-style
 * left-to-right layout. The AutomataGraph component consumes this
 * and is position-agnostic.
 *
 * **Algorithm:**
 * 1. BFS from the start state to compute layer (distance from start).
 * 2. Assign x = layer * horizontalSpacing.
 * 3. Within each layer, distribute nodes vertically with equal spacing.
 *
 * ZERO React imports. Pure TypeScript.
 */

import type { StateId, NFA, DFA, MinDFA } from '../types/automata';

/** Position information for a single node in the graph. */
export interface NodePosition {
  id: StateId;
  x: number;
  y: number;
  layer: number;
}

/** Edge information for the graph. */
export interface GraphEdge {
  source: StateId;
  target: StateId;
  label: string;
}

/** Complete layout data consumed by AutomataGraph. */
export interface LayoutGraph {
  nodes: NodePosition[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/** Configuration for layout spacing. */
const HORIZONTAL_SPACING = 150;
const VERTICAL_SPACING = 80;
const PADDING = 60;

/**
 * Compute a left-to-right layered layout for an NFA.
 *
 * BFS from startState determines each state's layer (horizontal position).
 * States within the same layer are spaced vertically.
 *
 * @param automaton - An NFA, DFA, or MinDFA.
 * @returns A LayoutGraph with positions for each state and all edges.
 */
export function computeLayout(
  automaton: NFA | DFA | MinDFA
): LayoutGraph {
  const states = [...automaton.states];
  const isNFA = isNFAType(automaton);

  // ── BFS to determine layers ──
  const layerMap = new Map<StateId, number>();
  const queue: StateId[] = [automaton.startState];
  layerMap.set(automaton.startState, 0);

  while (queue.length > 0) {
    const state = queue.shift()!;
    const currentLayer = layerMap.get(state)!;

    const transMap = automaton.transitions.get(state);
    if (!transMap) continue;

    if (isNFA) {
      // NFA transitions: Map<string, Set<StateId>>
      const nfaTransMap = transMap as Map<string, Set<StateId>>;
      for (const [, targets] of nfaTransMap) {
        for (const target of targets) {
          if (!layerMap.has(target)) {
            layerMap.set(target, currentLayer + 1);
            queue.push(target);
          }
        }
      }
    } else {
      // DFA transitions: Map<string, StateId>
      const dfaTransMap = transMap as Map<string, StateId>;
      for (const [, target] of dfaTransMap) {
        if (!layerMap.has(target)) {
          layerMap.set(target, currentLayer + 1);
          queue.push(target);
        }
      }
    }
  }

  // Assign unreachable states to the last layer + 1
  const maxLayer = Math.max(0, ...layerMap.values());
  for (const state of states) {
    if (!layerMap.has(state)) {
      layerMap.set(state, maxLayer + 1);
    }
  }

  // ── Group states by layer ──
  const layers = new Map<number, StateId[]>();
  for (const [state, layer] of layerMap) {
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(state);
  }

  // ── Assign positions ──
  const nodes: NodePosition[] = [];
  const totalLayers = Math.max(...layers.keys()) + 1;

  for (const [layer, layerStates] of layers) {
    const count = layerStates.length;
    for (let i = 0; i < count; i++) {
      nodes.push({
        id: layerStates[i],
        x: PADDING + layer * HORIZONTAL_SPACING,
        y: PADDING + i * VERTICAL_SPACING + (VERTICAL_SPACING * (1 - count)) / 2 + (count > 1 ? (VERTICAL_SPACING * count) / 2 : VERTICAL_SPACING),
        layer,
      });
    }
  }

  // ── Collect edges ──
  const edges: GraphEdge[] = [];
  for (const state of states) {
    const transMap = automaton.transitions.get(state);
    if (!transMap) continue;

    if (isNFA) {
      const nfaTransMap = transMap as Map<string, Set<StateId>>;
      for (const [symbol, targets] of nfaTransMap) {
        for (const target of targets) {
          edges.push({
            source: state,
            target,
            label: symbol === '' ? 'ε' : symbol,
          });
        }
      }
    } else {
      const dfaTransMap = transMap as Map<string, StateId>;
      for (const [symbol, target] of dfaTransMap) {
        edges.push({ source: state, target, label: symbol });
      }
    }
  }

  return {
    nodes,
    edges,
    width: PADDING * 2 + totalLayers * HORIZONTAL_SPACING,
    height: PADDING * 2 + Math.max(...[...layers.values()].map(l => l.length)) * VERTICAL_SPACING,
  };
}

/** Type guard: is this automaton an NFA (transitions values are Set<StateId>)? */
function isNFAType(
  automaton: NFA | DFA | MinDFA
): automaton is NFA {
  // Check if any transition value is a Set (NFA) vs string (DFA)
  for (const [, transMap] of automaton.transitions) {
    for (const [, value] of transMap) {
      return value instanceof Set;
    }
  }
  return false;
}
