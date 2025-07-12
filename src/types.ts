import { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

export interface Node extends SimulationNodeDatum {
  id: number;
  label: string;
  url: string;
  title?: string;
  size: number;
  isDragging?: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

export interface Edge extends SimulationLinkDatum<Node> {
  source: number | string | Node;
  target: number | string | Node;
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

export interface ColorOptions {
  node: string;
  nodeStroke: string;
  nodeFont: string;
  edge: string;
  nodeHighlight: string;
  edgeHighlight: string;
  background: string;
}

export interface SizingOptions {
  minNodeSize: number;
  maxNodeSize: number;
}

export interface SimulationOptions {
  linkDistance: number;
  linkStrength: number;
  chargeStrength: number;
  collisionStrength: number;
  alpha: number;
  finalAlpha: number;
  simulationDelay: number;
}

export interface InteractionOptions {
  zoomMin: number;
  zoomMax: number;
  labelShowThreshold: number;
}

export interface CullingOptions {
  enabled: boolean;
  margin: number;
  autoEnable: boolean;
  nodeThreshold: number;
  edgeThreshold: number;
}

export interface ObsiGraphOptions {
  initialZoomFactor: number;
  zoomToFit: boolean;
  font: string;
  nodesHaveLinks: boolean;
  colors: {
    light: ColorOptions;
    dark: ColorOptions;
  };
  sizing: SizingOptions;
  simulation: SimulationOptions;
  interaction: InteractionOptions;
  culling?: CullingOptions;
  disableTransitions?: boolean;
} 

