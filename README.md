# ObsiGraph

A lightweight and customizable library for rendering interactive force-directed graphs, inspired by Obsidian. It uses Pixi.JS for rendering and D3 for force simulation, making it both performant and easy to use.

![demo](docs/obsigraph.gif)

## Features

- **High Performance:** Renders graphs smoothly using Pixi.JS, even with a large number of nodes.
- **Interactive:** Supports zooming, panning, and node dragging.
- **Dynamic Layout:** Uses a D3 force simulation for a physics-based layout.
- **Customizable:** Easily change colors, node sizes, and simulation parameters.
- **Theming:** Provides dark/light mode settings.
- **Efficient:** Includes viewport culling to only render visible nodes and edges.

## How to Use

First, build the browser-compatible library file:

```bash
npm run build:browser
```

Then, include it in your HTML file and instantiate the graph:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>ObsiGraph Demo</title>
    <style>
      body,
      html {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }
      canvas {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <canvas id="graph-canvas"></canvas>

    <!-- Include the library -->
    <script src="../dist/obsigraph.browser.js"></script>

    <script>
      const canvas = document.getElementById("graph-canvas");

      const nodes = [
        { id: "1", label: "Node 1" },
        { id: "2", label: "Node 2" },
        { id: "3", label: "Node 3" },
      ];

      const edges = [
        { from: "1", to: "2" },
        { from: "2", to: "3" },
      ];

      const graph = new ObsiGraph(canvas, nodes, edges);
    </script>
  </body>
</html>
```

## Configuration

You can customize the graph by passing an options object as the fourth argument to the constructor.

```javascript
const options = {
  theme: "dark",
  simulation: {
    chargeStrength: -500,
    linkDistance: 200,
  },
};

const graph = new ObsiGraph(canvas, nodes, edges, options);
```

Here are the default options:

```javascript
{
  initialZoomFactor: 0.7,
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
    linkStrength: 0.2,
    chargeStrength: -300,
    collisionStrength: 0.2,
    alpha: 0.9,
    finalAlpha: 0.005,
    simulationDelay: 10000,
  },
  interaction: {
    zoomMin: 0.1,
    zoomMax: 5,
    labelThreshold: 0.3,
  },
  culling: {
    enabled: true,
    margin: 100,
    autoEnable: true,
    nodeThreshold: 1000,
    edgeThreshold: 2000,
  },
  font: 'sans-serif',
  disableTransitions: false,
};
```

## API Methods

The `ObsiGraph` instance provides several methods to interact with the graph:

- `zoomToFit()`: Adjusts the zoom to fit all nodes in the viewport.
- `zoomIn(factor?: number)`: Zooms in by a given factor.
- `zoomOut(factor?: number)`: Zooms out by a given factor.
- `updateData(nodes: any[], edges: any[])`: Replaces the graph data and restarts the simulation.
- `removeOrphanNodes()`: Removes nodes that have no edges.
- `setTheme(theme: 'light' | 'dark')`: Switches between light and dark themes.
- `resize()`: Resizes the canvas to fit its container.
- `destroy()`: Cleans up the graph instance and removes event listeners.
- `setCullingEnabled(enabled: boolean)`: Enables or disables viewport culling.
- `getCullingStats()`: Returns statistics about visible nodes and edges.

## Building from Source

To build the project, first install the dependencies:

```bash
npm install
```

Then, run one of the build scripts:

- `npm run dev`: Starts a development server with live reloading.
- `npm run build`: Creates a minified ES module build in `dist/obsigraph.js`.
- `npm run build:browser`: Creates a minified browser-compatible build in `dist/obsigraph.browser.js`.
- `npm run build:demo`: Creates a minified bundle for the demo.
