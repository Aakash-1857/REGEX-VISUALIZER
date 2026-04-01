/**
 * AutomataGraph.tsx — Center panel: Cytoscape.js canvas for NFA/DFA/MinDFA visualization.
 *
 * Features:
 * - Renders the active stage (NFA, DFA, or MinDFA) as a directed graph
 * - dagre layout for small graphs, cose for 20+ states
 * - Accept states: double-ringed (thicker border)
 * - Start state: inbound arrow from invisible "init" node
 * - Click state → highlight ε-closure (NFA) or the state (DFA/MinDFA)
 * - Hover MinDFA state → tooltip listing merged DFA states
 * - Comparison mode: split canvas with both MinDFAs
 * - PNG/SVG export via Cytoscape .png() / .svg()
 * - Edges between same source/target with different labels are merged
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import cytoscape from 'cytoscape';
import dagre from 'cytoscape-dagre';
import { useAutomata } from '../hooks/useAutomata';
import { epsilonClosure } from '../logic/AutomataEngine';
import type { NFA, DFA, MinDFA, StateId } from '../types/automata';

// Register dagre layout
cytoscape.use(dagre);

/** Cytoscape style constants for the pen-and-paper aesthetic. */
const CY_STYLE: cytoscape.StylesheetStyle[] = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-family': '"JetBrains Mono", monospace',
      'font-size': '11px',
      color: '#111',
      'background-color': '#fff',
      'border-width': 1,
      'border-color': '#111',
      'border-style': 'solid',
      width: 40,
      height: 40,
      shape: 'ellipse',
    },
  },
  {
    selector: 'node.accept',
    style: {
      'border-width': 3,
      'border-style': 'double',
    },
  },
  {
    selector: 'node.highlighted',
    style: {
      'background-color': '#ffffcc',
      'border-color': '#111',
      'border-width': 2,
    },
  },
  {
    selector: 'node.init-node',
    style: {
      width: 1,
      height: 1,
      'background-opacity': 0,
      'border-width': 0,
      label: '',
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(label)',
      'font-family': '"Crimson Pro", serif',
      'font-size': '12px',
      'font-style': 'italic',
      color: '#111',
      'text-background-color': '#fafafa',
      'text-background-opacity': 1,
      'text-background-padding': '2px',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'target-arrow-color': '#111',
      'arrow-scale': 0.8,
      'line-color': '#111',
      width: 1,
    },
  },
  {
    selector: 'edge.init-edge',
    style: {
      label: '',
      width: 1,
      'line-color': '#111',
      'target-arrow-color': '#111',
      'target-arrow-shape': 'triangle',
    },
  },
  {
    selector: 'edge.epsilon',
    style: {
      'line-style': 'dashed',
    },
  },
  {
    selector: 'edge.bridge',
    style: {
      'line-style': 'dashed',
      'line-color': '#999',
      'target-arrow-shape': 'none',
      label: 'equivalent',
      'font-size': '10px',
      'color': '#999',
      'text-background-opacity': 1,
      'text-background-color': '#fafafa',
      width: 1,
      'curve-style': 'unbundled-bezier',
    },
  },
  {
    selector: '.automaton-wrapper',
    style: {
      'background-opacity': 0.02,
      'background-color': '#111',
      'border-width': 1,
      'border-style': 'dashed',
      'border-color': '#666',
      'padding': 20,
      label: 'data(label)',
      'text-valign': 'top',
      'text-halign': 'center',
      'text-margin-y': 4,
      'font-family': '"JetBrains Mono", monospace',
      'font-weight': 'bold',
      'font-size': '12px',
      'color': '#333',
    },
  },
];

export function AutomataGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const { state, dispatch } = useAutomata();
  const [, setTooltipContent] = useState<string>('');

  // Get the active automaton
  const getActiveAutomaton = useCallback((): NFA | DFA | MinDFA | null => {
    const pipeline = state.pipeline;
    switch (state.activeStage) {
      case 'nfa': return pipeline.nfa;
      case 'dfa': return pipeline.dfa;
      case 'minDfa': return pipeline.minDfa;
      default: return null;
    }
  }, [state.activeStage, state.pipeline]);

  const getActiveAutomatonB = useCallback((): NFA | DFA | MinDFA | null => {
    if (state.mode !== 'comparison' || !state.pipelineB) return null;
    const pipeline = state.pipelineB;
    switch (state.activeStage) {
      case 'nfa': return pipeline.nfa;
      case 'dfa': return pipeline.dfa;
      case 'minDfa': return pipeline.minDfa;
      default: return null;
    }
  }, [state.mode, state.pipelineB, state.activeStage]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: CY_STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, []);

  // Update graph when automaton or highlighted states change
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const automaton = getActiveAutomaton();
    const automatonB = getActiveAutomatonB();

    cy.elements().remove();

    if (!automaton) {
      // Show empty state message
      return;
    }

    const isNFA = isNFAType(automaton);
    const useGroups = state.mode === 'comparison' && automatonB !== null;
    const elements = buildElements(automaton, state.highlightedStates, state.activeStage, 'a', useGroups);

    if (useGroups && automatonB) {
      const elementsB = buildElements(automatonB, new Set(), state.activeStage, 'b', true);
      elements.push(...elementsB);

      // Add bridge lines for bijection
      if (state.activeStage === 'minDfa' && state.equivalenceResult?.equivalent && state.equivalenceResult.bijection) {
        console.log(`[Graph Render] Drawing ${state.equivalenceResult.bijection.length} bijection bridges (Left: MinDFA, Right: MinDFA)`);
        for (const [stateA, stateB] of state.equivalenceResult.bijection) {
          console.log(`[Graph Render] Node A: a-${stateA} | Node B: b-${stateB}`); // Instrumentation
          elements.push({
            data: {
              id: `bridge-${stateA}-${stateB}`,
              source: `a-${stateA}`,
              target: `b-${stateB}`,
            },
            classes: 'bridge',
          });
        }
      } else if (state.mode === 'comparison' && state.equivalenceResult?.bijection) {
        console.log(`[Graph Render] Skipping bridges. activeStage is '${state.activeStage}', requires 'minDfa'.`);
      }
    }

    cy.add(elements);

    // Choose layout based on state count
    const stateCount = automaton.states.size + (automatonB?.states.size ?? 0);
    const layoutName = stateCount > 20 ? 'cose' : 'dagre';

    cy.layout({
      name: layoutName,
      rankDir: 'LR',
      nodeSep: 50,
      rankSep: 80,
      edgeSep: 20,
      animate: false,
      fit: true,
      padding: 40,
    } as dagre.DagreLayoutOptions).run();

    cy.fit(undefined, 40);

    // ── Click handler: highlight ε-closure or single state ──
    cy.on('tap', 'node', (evt: cytoscape.EventObject) => {
      const nodeId = evt.target.data('stateId') as StateId;
      if (!nodeId) return;

      if (isNFA && state.activeStage === 'nfa') {
        const nfa = automaton as NFA;
        const closure = epsilonClosure(nfa, new Set([nodeId]));
        dispatch({ type: 'SET_HIGHLIGHTED', payload: closure });
      } else {
        dispatch({ type: 'SET_HIGHLIGHTED', payload: new Set([nodeId]) });
      }
    });

    // ── Hover handler for MinDFA: show merged states ──
    cy.on('mouseover', 'node', (evt: cytoscape.EventObject) => {
      const stateId = evt.target.data('stateId') as StateId;
      if (!stateId || !tooltipRef.current) return;

      if (state.activeStage === 'minDfa' && state.pipeline.minDfa) {
        const merged = state.pipeline.minDfa.mergedStates.get(stateId);
        if (merged && merged.size > 0) {
          const content = `DFA states: {${[...merged].join(', ')}}`;
          setTooltipContent(content);
          tooltipRef.current.textContent = content;
          tooltipRef.current.style.display = 'block';
          const pos = evt.renderedPosition || evt.target.renderedPosition();
          tooltipRef.current.style.left = `${pos.x + 20}px`;
          tooltipRef.current.style.top = `${pos.y - 10}px`;
        }
      }
    });

    cy.on('mouseout', 'node', () => {
      if (tooltipRef.current) {
        tooltipRef.current.style.display = 'none';
      }
    });

    // Click background to clear highlights
    cy.on('tap', (evt: cytoscape.EventObject) => {
      if (evt.target === cy) {
        dispatch({ type: 'SET_HIGHLIGHTED', payload: new Set() });
      }
    });
  }, [getActiveAutomaton, getActiveAutomatonB, state.highlightedStates, state.activeStage, state.mode, state.equivalenceResult, state.pipeline.minDfa, dispatch]);

  // ── Export functions ──
  const exportPNG = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2, bg: '#fafafa' });
    downloadDataURL(png, 'automaton.png');
  };

  const exportSVG = () => {
    const cy = cyRef.current;
    if (!cy) return;
    // cytoscape-svg extension or fallback to png
    const svgMethod = (cy as unknown as Record<string, unknown>).svg;
    if (typeof svgMethod === 'function') {
      const svg = (svgMethod as (opts: Record<string, unknown>) => string)({ full: true, scale: 1, bg: '#fafafa' });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      downloadURL(url, 'automaton.svg');
    } else {
      // Fallback: export as PNG with SVG extension note
      const png = cy.png({ full: true, scale: 2, bg: '#fafafa' });
      downloadDataURL(png, 'automaton.png');
    }
  };

  return (
    <div className="panel flex-1 flex flex-col relative" style={{ minWidth: 0 }}>
      <div className="panel-header flex items-center justify-between">
        <span>
          Automaton —{' '}
          {state.activeStage === 'minDfa'
            ? 'Min-DFA'
            : state.activeStage.toUpperCase()}
        </span>
        <div className="flex gap-1">
          <button
            onClick={exportPNG}
            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
          >
            PNG
          </button>
          <button
            onClick={exportSVG}
            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
          >
            SVG
          </button>
        </div>
      </div>
      <div ref={containerRef} className="cy-container flex-1" />
      <div ref={tooltipRef} className="cy-tooltip" style={{ display: 'none' }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════

/** Check if an automaton is an NFA by examining transition value types. */
function isNFAType(automaton: NFA | DFA | MinDFA): automaton is NFA {
  for (const [, transMap] of automaton.transitions) {
    for (const [, value] of transMap) {
      return value instanceof Set;
    }
  }
  return false;
}

/**
 * Build Cytoscape elements from an automaton.
 * Prefix allows two automata (a-, b-) in comparison mode.
 */
function buildElements(
  automaton: NFA | DFA | MinDFA,
  highlighted: Set<StateId>,
  stage: string,
  prefix: string,
  useGroups?: boolean
): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];
  const isNFA = isNFAType(automaton);

  const parentId = useGroups ? `${prefix}-group` : undefined;

  if (parentId) {
    elements.push({
      data: {
        id: parentId,
        label: prefix === 'a' ? 'RE 1' : 'RE 2',
      },
      classes: 'automaton-wrapper',
    });
  }

  // ── Invisible init node for start arrow ──
  elements.push({
    data: { id: `${prefix}-init`, label: '', parent: parentId },
    classes: 'init-node',
  });

  // ── State nodes ──
  for (const stateId of automaton.states) {
    const classes: string[] = [];
    if (automaton.acceptStates.has(stateId)) classes.push('accept');
    if (highlighted.has(stateId)) classes.push('highlighted');

    elements.push({
      data: {
        id: `${prefix}-${stateId}`,
        label: stateId,
        stateId,
        parent: parentId
      },
      classes: classes.join(' '),
    });
  }

  // ── Init → start state edge ──
  elements.push({
    data: {
      id: `${prefix}-init-edge`,
      source: `${prefix}-init`,
      target: `${prefix}-${automaton.startState}`,
    },
    classes: 'init-edge',
  });

  // ── Transition edges ──
  // Merge edges with same source+target into one label (comma-separated)
  const edgeMap = new Map<string, string[]>();

  for (const [fromState, transMap] of automaton.transitions) {
    if (isNFA) {
      const nfaTransMap = transMap as Map<string, Set<StateId>>;
      for (const [symbol, targets] of nfaTransMap) {
        for (const target of targets) {
          const key = `${prefix}-${fromState}|${prefix}-${target}`;
          if (!edgeMap.has(key)) edgeMap.set(key, []);
          edgeMap.get(key)!.push(symbol === '' ? 'ε' : symbol);
        }
      }
    } else {
      const dfaTransMap = transMap as Map<string, StateId>;
      for (const [symbol, target] of dfaTransMap) {
        const key = `${prefix}-${fromState}|${prefix}-${target}`;
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key)!.push(symbol);
      }
    }
  }

  for (const [key, labels] of edgeMap) {
    const [source, target] = key.split('|');
    const label = labels.join(', ');
    const hasEpsilon = labels.includes('ε');

    elements.push({
      data: {
        id: `edge-${key}-${stage}`,
        source,
        target,
        label,
      },
      classes: hasEpsilon ? 'epsilon' : '',
    });
  }

  return elements;
}

function downloadDataURL(dataURL: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = filename;
  link.click();
}

function downloadURL(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
