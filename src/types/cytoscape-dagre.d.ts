declare module 'cytoscape-dagre' {
  import type cytoscape from 'cytoscape';

  interface DagreLayoutOptions extends cytoscape.BaseLayoutOptions {
    name: 'dagre';
    rankDir?: 'TB' | 'BT' | 'LR' | 'RL';
    nodeSep?: number;
    rankSep?: number;
    edgeSep?: number;
    animate?: boolean;
    fit?: boolean;
    padding?: number;
  }

  const ext: cytoscape.Ext;
  export = ext;
  export { DagreLayoutOptions };
}
