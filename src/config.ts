import { ObsiGraphOptions } from "./types";

export const GRAPH_DEFAULTS: ObsiGraphOptions = {
  initialZoomFactor: 0.9,
  zoomToFit: false,
  nodesHaveLinks: false,
  colors: {
    light: {
      node: '#b2b2b2',
      nodeStroke: '#b2b2b2',
      nodeFont: '#3f3f3f',
      edge: 'rgba(98, 98, 98, 1)',
      nodeHighlight: '#9165ea',
      edgeHighlight: '#9165ea',
      background: '#ffffff',
    },
    dark: {
      node: '#b2b2b2',
      nodeStroke: '#b2b2b2',
      nodeFont: '#e8f4f8',
      edge: 'rgb(224, 224, 224)',
      nodeHighlight: '#9165ea',
      edgeHighlight: 'rgb(145 101 234)',
      background: '#0d1117',
    },
  },
  sizing: {
    minNodeSize: 5,
    maxNodeSize: 50,
  },
  simulation: {
    linkDistance: 150,
    linkStrength: 0.8,
    chargeStrength: -300,
    collisionStrength: 0.2,
    alpha: 0.9,
    finalAlpha: 0.005,
    simulationDelay: 10000,
  },
  interaction: {
    zoomMin: 0.2,
    zoomMax: 5,
    labelShowThreshold: 0.8,
  },
  culling: {
    enabled: true,
    margin: 100,
    autoEnable: true,
    nodeThreshold: 50,
    edgeThreshold: 50,
  },
  font: 'sans-serif',
  disableTransitions: true,
};