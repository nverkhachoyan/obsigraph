import ObsiGraph from './main';
import { Node, Edge } from './types';
import  graph  from '../mock/500-nodes';

async function initializeGraph() {
  const canvas = document.getElementById('graph-network') as HTMLCanvasElement;
  if (canvas) {
    const obsigraph = new ObsiGraph(
      canvas,
      graph.nodes as Node[],
      graph.edges as Edge[]
    );
    (window as any).obsigraph = obsigraph;
  } else {
    console.error('Could not find #graph-network container');
  }
}

initializeGraph(); 