import { 
  forceSimulation, 
  forceLink, 
  forceManyBody, 
  forceX, forceY, 
  forceCollide, 
  Simulation, 
  ForceLink, 
  ForceManyBody,
} from 'd3-force';
import * as PIXI from 'pixi.js';
import { Tween, Group } from '@tweenjs/tween.js';
import { GRAPH_DEFAULTS } from './config';
import { Node, Edge, ObsiGraphOptions } from './types';
import { merge } from 'lodash';
import { throttle } from 'lodash';

interface ObsiGraphType {
  nodes: Node[];
  edges: Edge[];
  options: ObsiGraphOptions;
  hoveredNode: Node | null;
  draggedNode: Node | null;
  simulation: Simulation<Node, Edge> | null;
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  theme: 'light' | 'dark';
  zoomToFit(): ObsiGraph;
  zoomIn(factor?: number): ObsiGraph;
  zoomOut(factor?: number): ObsiGraph;
  updateData(nodes: any[], edges: any[]): ObsiGraph;
  removeOrphanNodes(): ObsiGraph;
  setTheme(theme: 'light' | 'dark'): ObsiGraph;
  resize(): ObsiGraph;
  destroy(): void;
}

export default class ObsiGraph implements ObsiGraphType {
  public nodes: Node[];
  public edges: Edge[];
  public options: ObsiGraphOptions;
  public hoveredNode: Node | null = null;
  public draggedNode: Node | null = null;
  public simulation: Simulation<Node, Edge> | null = null;
  public canvas!: HTMLCanvasElement;
  public width: number = 0;
  public height: number = 0;
  public theme: 'light' | 'dark' = 'dark';
  
  private app!: PIXI.Application;
  private graphContainer!: PIXI.Container;
  private nodeContainer!: PIXI.Container;
  private labelContainer!: PIXI.Container;
  private edgeContainer!: PIXI.Container;
  private nodeGraphics: Map<string | number, PIXI.Graphics> = new Map();
  private edgeGraphics: Map<Edge, PIXI.Graphics> = new Map();
  private nodeLabels: Map<string | number, PIXI.Text> = new Map();
  private dragStartTime: number = 0;
  private _tweenGroup = new Group();
  private hasChanged: boolean = true;
  private wheelHandler: (event: WheelEvent) => void = () => {};
  private adjacencyMap: Map<string | number, Set<string | number>> = new Map();
  private previouslyHoveredNode: Node | null = null;

  private viewportBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } = { left: 0, right: 0, top: 0, bottom: 0 };
  
  private visibleNodes: Set<string | number> = new Set();
  private visibleEdges: Set<Edge> = new Set();
  private cullingEnabled: boolean;
  
  private animationFrameId: number | null = null;
  private degreeMap: { [id: string]: number } = {};
  private linkForce: ForceLink<Node, Edge> | undefined;
  private chargeForce: ForceManyBody<Node> | undefined;

  constructor(canvas: HTMLCanvasElement, nodes: Node[], edges: Edge[], options?: ObsiGraphOptions) {
    this.canvas = canvas;
    this.options = merge({}, GRAPH_DEFAULTS, options);
    this.cullingEnabled = this.options.culling!.enabled;
    
    this.nodes = nodes.map(d => ({ ...d, size: 0 }));
    this.edges = edges.map(e => ({ ...e }));

    this.init();
  }

  private async init() {
    await this.setupCanvas();
    this.calculateNodeDegrees();
    this.calculateNodeSizes();
    this.updateEdgeReferences();
    this.buildAdjacencyMap();
    if(this.options.culling?.autoEnable) this.autoEnableCulling();
    this.createPixiGraph();
    this.startSimulation();
    this.animate();
 
    if (this.options.zoomToFit) {
      setTimeout(() => {
        this.zoomToFit();
      }, 500);
    }
  }

  private async setupCanvas() {
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;

    this.app = new PIXI.Application();

    await this.app.init({
        canvas: this.canvas,
        width: this.width,
        height: this.height,
        backgroundColor: this.options.colors[this.theme].background,
        resolution: devicePixelRatio,
        autoDensity: true,
        antialias: true,
        autoStart: false,
    });

    this.graphContainer = new PIXI.Container();
    this.graphContainer.position.set(this.width / 2, this.height / 2);
    this.graphContainer.isRenderGroup = true;
    this.app.stage.addChild(this.graphContainer);

    this.edgeContainer = new PIXI.Container();
    this.graphContainer.addChild(this.edgeContainer);

    this.nodeContainer = new PIXI.Container();
    this.graphContainer.addChild(this.nodeContainer);

    this.labelContainer = new PIXI.Container();
    this.graphContainer.addChild(this.labelContainer);

    this.app.stage.interactive = true;
    this.app.stage.hitArea = this.app.screen;

    let isPanning = false;
    let panStartPoint = new PIXI.Point();
    let panStartContainerPosition = new PIXI.Point();

    this.app.stage.on('pointerdown', (event) => {
        if (event.target === this.app.stage) {
            isPanning = true;
            panStartPoint = event.global.clone();
            panStartContainerPosition = this.graphContainer.position.clone();
        }
    });

    this.app.stage.on('pointerup', () => {
        isPanning = false;
    });

    this.app.stage.on('pointerupoutside', () => {
        isPanning = false;
    });

    this.app.stage.on('pointermove', (event) => {
        if (isPanning) {
            const dx = event.global.x - panStartPoint.x;
            const dy = event.global.y - panStartPoint.y;
            this.graphContainer.position.set(panStartContainerPosition.x + dx, panStartContainerPosition.y + dy);
            this.hasChanged = true;
        }
    });
    
    this.wheelHandler = (event: WheelEvent) => {
        event.preventDefault();
        const scaleFactor = event.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(this.options.interaction.zoomMin, Math.min(this.options.interaction.zoomMax, this.graphContainer.scale.x * scaleFactor));
        
        const worldPoint = this.graphContainer.toLocal(new PIXI.Point(event.offsetX, event.offsetY));
        
        const newPosX = event.offsetX - worldPoint.x * newScale;
        const newPosY = event.offsetY - worldPoint.y * newScale;

        this.graphContainer.position.set(newPosX, newPosY);
        this.graphContainer.scale.set(newScale);
        this.hasChanged = true;
    };

    this.app.canvas.addEventListener('wheel', this.wheelHandler);
  }
  
  private calculateNodeDegrees() {
    this.degreeMap = {};
    this.nodes.forEach(node => { this.degreeMap[node.id] = 0; });
    this.edges.forEach(edge => {
      if (this.degreeMap[edge.source as number] !== undefined) this.degreeMap[edge.source as number]++;
      if (this.degreeMap[edge.target as number] !== undefined) this.degreeMap[edge.target as number]++;
    });
  }

  private calculateNodeSizes() {
    const degrees = Object.values(this.degreeMap);
    const minDegree = Math.min(...degrees);
    const maxDegree = Math.max(...degrees);
    const minNodeSize = this.options.sizing?.minNodeSize;
    const maxNodeSize = this.options.sizing?.maxNodeSize;

    this.nodes.forEach(node => {
      const degree = this.degreeMap[node.id] || 0;
      node.size = maxDegree > minDegree
        ? minNodeSize + ((degree - minDegree) * (maxNodeSize - minNodeSize)) / (maxDegree - minDegree)
        : minNodeSize;
    });
  }

  private createPixiGraph() {
    this.nodeGraphics.clear();
    this.nodeLabels.clear();
    this.edgeGraphics.clear();
    this.nodeContainer.removeChildren();
    this.labelContainer.removeChildren();
    this.edgeContainer.removeChildren();

    this.edges.forEach(edge => {
        const g = new PIXI.Graphics();
        this.edgeGraphics.set(edge, g);
        this.edgeContainer.addChild(g);
    });

    this.nodes.forEach(node => {
        const graphics = new PIXI.Graphics();
        graphics.interactive = true;
        graphics.cursor = 'pointer';

        this.drawNode(graphics, node, false);
        if (node.x && node.y) {
            graphics.position.set(node.x, node.y);
        }

        this.nodeGraphics.set(node.id, graphics);
        this.nodeContainer.addChild(graphics);
        this.addInteractionEvents(graphics, node);

        const label = new PIXI.Text({
            text: String(node.label || node.title || node.id),
            style: {
                fontFamily: this.options.font,
                fontSize: 12,
                fill: this.options.colors[this.theme].nodeFont,
                align: 'center',
            }
        });
        label.anchor.set(0.5, 0);
        label.resolution = 2;
        this.nodeLabels.set(node.id, label);
        this.labelContainer.addChild(label);
    });
  }

  private drawNode(graphics: PIXI.Graphics, node: Node, isHovered: boolean) {
    const isThereHoveredNode = this.hoveredNode?.id !== undefined;
    const isNeighbor = this.hoveredNode ? this.areNodesConnected(this.hoveredNode, node) : false;
    const strokeColor = isHovered 
        ? this.options.colors[this.theme].nodeHighlightStroke 
        : isThereHoveredNode && !isNeighbor 
          ? this.options.colors[this.theme].nodeDimmedStroke 
          : this.options.colors[this.theme].nodeStroke;

    const fillColor = isHovered
        ? this.options.colors[this.theme].nodeHighlight
        : isThereHoveredNode && !isNeighbor
          ? this.options.colors[this.theme].nodeDimmed
          : this.options.colors[this.theme].node;

    graphics.clear();
    graphics.circle(0, 0, node.size)
        .fill({ color: fillColor, alpha: 1 })
        .stroke({ width: 1, color: strokeColor, alpha: 1 });
  }

  private redrawEdges() {
    const edgeColor = this.options.colors[this.theme].edge;
    const edgeHighlightColor = this.options.colors[this.theme].edgeHighlight;

    this.edges.forEach(edge => {
        const g = this.edgeGraphics.get(edge);
        if(!g) return;

        const isVisible = this.cullingEnabled ? this.visibleEdges.has(edge) : true;
        g.visible = isVisible;

        if (!isVisible) return;
        
        g.clear();
        
        const source = edge.source as Node;
        const target = edge.target as Node;

        if (source.x && target.x) {
            let finalColor = edgeColor;
            let finalAlpha = 0.5;

            if (this.hoveredNode) {
                const isConnectedToHovered = source.id === this.hoveredNode.id || target.id === this.hoveredNode.id;
                if (isConnectedToHovered) {
                    finalColor = edgeHighlightColor;
                    finalAlpha = 1;
                } else {
                    finalAlpha = 0.1;
                }
            }
            g.moveTo(source.x, source.y!).lineTo(target.x, target.y!).stroke({ width: 1, color: finalColor, alpha: finalAlpha });
        }
    });
  }

  private addInteractionEvents(graphics: PIXI.Graphics, node: Node) {
    const onDragMove = (event: PIXI.FederatedPointerEvent) => {
        if (this.draggedNode) {
            const newPosition = event.getLocalPosition(this.graphContainer);
            this.draggedNode.fx = newPosition.x;
            this.draggedNode.fy = newPosition.y;
            this.hasChanged = true;
        }
    };

    const onDragEnd = () => {
        if (!this.draggedNode) return;

        if (Date.now() - this.dragStartTime < 200) {
            this.onNodeClick(this.draggedNode);
        }

        this.app.stage.off('pointermove', onDragMove);
        this.app.stage.off('pointerup', onDragEnd);
        this.app.stage.off('pointerupoutside', onDragEnd);

        if (!this.simulation) return;

        this.draggedNode.isDragging = false;
        this.draggedNode.fx = null;
        this.draggedNode.fy = null;
        this.simulation.alphaTarget(0);
        this.draggedNode = null;
    };
    
    const onDragStart = (event: PIXI.FederatedPointerEvent) => {
        event.stopPropagation();
        
        this.dragStartTime = Date.now();
        if (!this.simulation) return;
        node.isDragging = true;
        this.draggedNode = node;
        this.simulation.alphaTarget(0.1).restart();

        this.app.stage.on('pointermove', onDragMove);
        this.app.stage.on('pointerup', onDragEnd);
        this.app.stage.on('pointerupoutside', onDragEnd);
    };

    graphics
        .on('pointerover', () => {
            if (this.draggedNode) return;
            this.previouslyHoveredNode = this.hoveredNode;
            this.hoveredNode = node;
            this.updateNodeAppearances();
            this.updateHoverStyles();
        })
        .on('pointerout', () => {
            if (this.draggedNode) return;
            this.previouslyHoveredNode = this.hoveredNode;
            this.hoveredNode = null;
            this.updateNodeAppearances();
            this.updateHoverStyles();
        })
        .on('pointerdown', onDragStart)
  }

  private onNodeClick(node: Node) {
    if (node.url && this.options.nodesHaveLinks) {
      try {
        const url = new URL(node.url, window.location.origin);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.location.href = url.href;
        }
      } catch (error) {
        console.warn('Invalid URL:', node.url, error);
      }
    }
  }

  private animate() {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    if (this.hasChanged) {
        if (this.cullingEnabled) {
          this.updateVisibility();
        }

        this.updateNodePositions();
        this.redrawEdges();
 
        this._tweenGroup.update();
    
        this.app.renderer.render(this.app.stage);
        
        const isTweening = this._tweenGroup.getAll().length > 0;
        this.hasChanged = isTweening;
    }
  }

  private updateNodeAppearances() {
    let needsRender = false;

    this.nodes.forEach(n => {
        const g = this.nodeGraphics.get(n.id);
        if (g) {
            const isHovered = this.hoveredNode?.id === n.id;
            const isConnected = this.hoveredNode ? this.areNodesConnected(this.hoveredNode, n) : false;
            
            let finalAlpha = 1;
             
            if (this.hoveredNode && !isHovered && !isConnected) {
                finalAlpha = 0.2;
            }
            
            if (this.options.disableTransitions) {
                g.alpha = finalAlpha;
                needsRender = true;
            } else {
                const tween = new Tween(g, this._tweenGroup)
                    .to({ alpha: finalAlpha }, 150)
                    .start();
                this._tweenGroup.add(tween);
                this.hasChanged = true;
            }

            needsRender = true;
            this.drawNode(g, n, isHovered);
        }
    });

 
    if(needsRender){
      this.app.renderer.render(this.app.stage);
    }
  }

  private updateHoverStyles() {
    const nodesToUpdate = new Set<Node>();

    if (this.previouslyHoveredNode) {
        nodesToUpdate.add(this.previouslyHoveredNode);
        this.adjacencyMap.get(this.previouslyHoveredNode.id)?.forEach(neighborId => {
            const neighborNode = this.nodes.find(n => n.id === neighborId);
            if (neighborNode) nodesToUpdate.add(neighborNode);
        });
    }

    if (this.hoveredNode) {
        nodesToUpdate.add(this.hoveredNode);
        this.adjacencyMap.get(this.hoveredNode.id)?.forEach(neighborId => {
            const neighborNode = this.nodes.find(n => n.id === neighborId);
            if (neighborNode) nodesToUpdate.add(neighborNode);
        });
    }

    this.nodes.forEach(node => {
        const label = this.nodeLabels.get(node.id);
        if (!label) return;

        let finalAlpha = 1;
        let fontSize = 8;
        const isHovered = this.hoveredNode?.id === node.id;

        if (this.hoveredNode) {
            const isConnected = this.areNodesConnected(this.hoveredNode, node);
            if (isHovered || isConnected) {
                finalAlpha = 1;
                if(isHovered) fontSize = 24;
            } else {
                finalAlpha = 0.2;
            }
        }
        
        const alphaTween = new Tween(label, this._tweenGroup)
            .to({ alpha: finalAlpha }, 150)
            .start();
        this._tweenGroup.add(alphaTween);
        
        const fontTween = new Tween(label.style, this._tweenGroup)
            .to({ fontSize }, 150)
            .start();
        this._tweenGroup.add(fontTween);
    });
    this.hasChanged = true;
  }

  private startSimulation() {
    const params = this.options.simulation;

    this.linkForce = forceLink<Node, Edge>(this.edges).id((d: Node) => d.id).distance(params.linkDistance).strength(params.linkStrength);
    this.chargeForce = forceManyBody().strength(params.chargeStrength);
    
    this.simulation = forceSimulation(this.nodes)
      .force("link", this.linkForce)
      .force("charge", this.chargeForce)
      .force("x", forceX(0).strength(0.03))
      .force("y", forceY(0).strength(0.03))
      .force("collision", 
        forceCollide<Node>()
        .radius((d: Node) => d.size + 2)
        .strength(params.collisionStrength))
      .alpha(params.alpha)
      .on('tick', () => {
          this.hasChanged = true;
      })
    
    setTimeout(() => {
      if (this.simulation) {
        this.simulation.alpha(params.finalAlpha);
      }
    }, params.simulationDelay);
  }

  private updateNodePositions() {
    const zoomLevel = this.graphContainer.scale.x;
    const zoomThreshold = this.options.interaction.labelShowThreshold;

    this.nodes.forEach(node => {
      const graphics = this.nodeGraphics.get(node.id);
      const label = this.nodeLabels.get(node.id);
      const isVisible = this.cullingEnabled ? this.visibleNodes.has(node.id) : true;
      
      if (graphics) {
        graphics.visible = isVisible;
        if (isVisible && node.x && node.y) {
          graphics.position.set(node.x, node.y);
        }
      }
      
      if (label) {
        const isLabelVisible = zoomLevel > zoomThreshold;
        label.visible = isVisible && isLabelVisible;

        if (label.visible) {
            if (node.x && node.y) {
                label.position.set(node.x, node.y + node.size + 4);
            }
        }
      }
    });
  }

  private updateEdgeReferences() {
    const nodeMap = new Map(this.nodes.map(n => [n.id, n]));
    this.edges.forEach(edge => {
      if (typeof edge.source !== 'object') {
        edge.source = nodeMap.get(edge.source as number)!;
      }
      if (typeof edge.target !== 'object') {
        edge.target = nodeMap.get(edge.target as number)!;
      }
    });
  }

  private areNodesConnected(nodeA: Node, nodeB: Node): boolean {
    if (!nodeA || !nodeB) return false;
    if (nodeA.id === nodeB.id) return false;
    return this.adjacencyMap.get(nodeA.id)?.has(nodeB.id) ?? false;
  }

  private buildAdjacencyMap() {
    this.adjacencyMap.clear();
    this.edges.forEach(edge => {
        const sourceId = typeof edge.source === 'object' ? (edge.source as Node).id : edge.source;
        const targetId = typeof edge.target === 'object' ? (edge.target as Node).id : edge.target;

        if (!this.adjacencyMap.has(sourceId)) {
            this.adjacencyMap.set(sourceId, new Set());
        }
        if (!this.adjacencyMap.has(targetId)) {
            this.adjacencyMap.set(targetId, new Set());
        }
        this.adjacencyMap.get(sourceId)!.add(targetId);
        this.adjacencyMap.get(targetId)!.add(sourceId);
    });
  }

  public zoomToFit(): ObsiGraph {
    if (this.nodes.length === 0) {
      return this;
    }

    const PADDING = 1;

    const xVals = this.nodes.map(n => n.x!);
    const yVals = this.nodes.map(n => n.y!);

    const minX = Math.min(...xVals);
    const maxX = Math.max(...xVals);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);

    const graphWidth = maxX - minX;
    const graphHeight = maxY - minY;

    if (graphWidth === 0 || graphHeight === 0) return this;

    const canvasWidth = this.width;
    const canvasHeight = this.height;

    const scaleX = (canvasWidth - PADDING * 2) / graphWidth;
    const scaleY = (canvasHeight - PADDING * 2) / graphHeight;
    const k = Math.min(scaleX, scaleY) * (this.options.initialZoomFactor);

    const graphCenterX = (minX + maxX) / 2;
    const graphCenterY = (minY + maxY) / 2;

    const tx = canvasWidth / 2 - graphCenterX * k;
    const ty = canvasHeight / 2 - graphCenterY * k;

    this.graphContainer.position.set(tx, ty);
    this.graphContainer.scale.set(k);

    return this;
  }

  private autoEnableCulling(): void {
    const { nodeThreshold, edgeThreshold } = this.options.culling!;
    this.cullingEnabled = this.nodes.length > nodeThreshold || this.edges.length > edgeThreshold;
  }

  private updateViewportBounds(): void {
    const scale = this.graphContainer.scale.x;
    const position = this.graphContainer.position;
    const margin = this.options.culling!.margin;
    
    const left = (-position.x) / scale - margin;
    const right = (this.width - position.x) / scale + margin;
    const top = (-position.y) / scale - margin;
    const bottom = (this.height - position.y) / scale + margin;
    
    this.viewportBounds = { left, right, top, bottom };
  }

  private isNodeInViewport(node: Node): boolean {
    if (!node.x || !node.y) return true;
    
    const nodeRadius = node.size || 5;
    return (
      node.x + nodeRadius >= this.viewportBounds.left &&
      node.x - nodeRadius <= this.viewportBounds.right &&
      node.y + nodeRadius >= this.viewportBounds.top &&
      node.y - nodeRadius <= this.viewportBounds.bottom
    );
  }

  private isEdgeInViewport(edge: Edge): boolean {
    const source = edge.source as Node;
    const target = edge.target as Node;
    
    if (!source.x || !source.y || !target.x || !target.y) return true;
    
    if (this.visibleNodes.has(source.id) || this.visibleNodes.has(target.id)) return true;
    
    return this.lineIntersectsViewport(
      source.x, source.y, 
      target.x, target.y
    );
  }

  /**
   * Cohen-Sutherland line clipping algorithm
   * https://en.wikipedia.org/wiki/Cohen-Sutherland_algorithm
   */
  private lineIntersectsViewport(x1: number, y1: number, x2: number, y2: number): boolean {
    const { left, right, top, bottom } = this.viewportBounds;
    
    const INSIDE = 0; // 0000
    const LEFT = 1;   // 0001
    const RIGHT = 2;  // 0010
    const BOTTOM = 4; // 0100
    const TOP = 8;    // 1000

    const computeOutCode = (x: number, y: number): number => {
      let code = INSIDE;
      if (x < left) code |= LEFT;
      else if (x > right) code |= RIGHT;
      if (y < top) code |= BOTTOM;
      else if (y > bottom) code |= TOP;
      return code;
    };

    let outcode1 = computeOutCode(x1, y1);
    let outcode2 = computeOutCode(x2, y2);

    while (true) {
      if (!(outcode1 | outcode2)) {
        return true;
      } else if (outcode1 & outcode2) {
        return false;
      } else {
        let x = 0, y = 0;
        const outcodeOut = outcode1 ? outcode1 : outcode2;

        if (outcodeOut & TOP) {
          x = x1 + (x2 - x1) * (bottom - y1) / (y2 - y1);
          y = bottom;
        } else if (outcodeOut & BOTTOM) {
          x = x1 + (x2 - x1) * (top - y1) / (y2 - y1);
          y = top;
        } else if (outcodeOut & RIGHT) {
          y = y1 + (y2 - y1) * (right - x1) / (x2 - x1);
          x = right;
        } else if (outcodeOut & LEFT) {
          y = y1 + (y2 - y1) * (left - x1) / (x2 - x1);
          x = left;
        }

        if (outcodeOut === outcode1) {
          x1 = x;
          y1 = y;
          outcode1 = computeOutCode(x1, y1);
        } else {
          x2 = x;
          y2 = y;
          outcode2 = computeOutCode(x2, y2);
        }
      }
    }
  }

  private updateVisibility(): void {
    this.updateViewportBounds();
    
    this.visibleNodes.clear();
    this.visibleEdges.clear();
    
    for (const node of this.nodes) {
      if (this.isNodeInViewport(node)) {
        this.visibleNodes.add(node.id);
      }
    }
    
    for (const edge of this.edges) {
      if (this.isEdgeInViewport(edge)) {
        this.visibleEdges.add(edge);
      }
    }
  }

  // --- Public API Methods ---

  public removeOrphanNodes(): ObsiGraph {
    const connectedNodeIds = new Set<string | number>();
    this.edges.forEach(edge => {
        const sourceId = typeof edge.source === 'object' ? (edge.source as Node).id : edge.source;
        const targetId = typeof edge.target === 'object' ? (edge.target as Node).id : edge.target;
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
    });

    const initialNodeCount = this.nodes.length;
    const filteredNodes = this.nodes.filter(node => connectedNodeIds.has(node.id));

    if (filteredNodes.length === initialNodeCount) {
        return this;
    }
    
    const filteredNodeIdSet = new Set(filteredNodes.map(n => n.id));
    const filteredEdges = this.edges
      .map(edge => {
          const sourceId = typeof edge.source === 'object' ? (edge.source as Node).id : edge.source;
          const targetId = typeof edge.target === 'object' ? (edge.target as Node).id : edge.target;
          return { from: sourceId, to: targetId };
      })
      .filter(edge => filteredNodeIdSet.has(edge.from as any) && filteredNodeIdSet.has(edge.to as any));

    this.updateData(filteredNodes, filteredEdges);

    return this;
  }

  public zoomIn(factor = 1.2): ObsiGraph {
    const newScale = Math.min(this.options.interaction?.zoomMax, this.graphContainer.scale.x * factor);
    
    const center = new PIXI.Point(this.width / 2, this.height / 2);
    const worldPoint = this.graphContainer.toLocal(center);
    
    const newPosX = center.x - worldPoint.x * newScale;
    const newPosY = center.y - worldPoint.y * newScale;

    this.graphContainer.position.set(newPosX, newPosY);
    this.graphContainer.scale.set(newScale);

    return this;
  }

  public zoomOut(factor = 0.8): ObsiGraph {
    const newScale = Math.max(this.options.interaction?.zoomMin, this.graphContainer.scale.x * factor);

    const center = new PIXI.Point(this.width / 2, this.height / 2);
    const worldPoint = this.graphContainer.toLocal(center);

    const newPosX = center.x - worldPoint.x * newScale;
    const newPosY = center.y - worldPoint.y * newScale;

    this.graphContainer.position.set(newPosX, newPosY);
    this.graphContainer.scale.set(newScale);

    return this;
  }

  public updateData(nodes: any[], edges: any[]): ObsiGraph {
    this.simulation?.stop();
    
    this.nodes = nodes.map(d => ({ ...d, size: 0 }));
    this.edges = edges.map(d => ({ source: d.from, target: d.to }));

    this.calculateNodeDegrees();
    this.calculateNodeSizes();
    this.updateEdgeReferences();
    this.buildAdjacencyMap();
    this.createPixiGraph();
    this.startSimulation();

    return this;
  }


  public setTheme(theme: 'light' | 'dark' = 'dark'): ObsiGraph {
    this.theme = theme;
    if(this.app?.renderer) {
      this.app.renderer.background.color = this.options.colors[this.theme].background;
    }
    this.updateNodeAppearances();
    this.redrawEdges();
    this.updateLabelColors();

    return this;
  }
  
  private updateLabelColors() {
    const fontColor = this.options.colors[this.theme].nodeFont;
    this.nodeLabels.forEach(label => {
        label.style.fill = fontColor;
    });
  }

  public resize = throttle((): ObsiGraph => {
    if (!this.canvas || !this.app?.renderer) return this;

    const containerRect = this.canvas.getBoundingClientRect();
    
    this.width = containerRect.width;
    this.height = containerRect.height;
    
    this.app.renderer.resize(this.width, this.height);

    this.simulation?.alpha(0.3).restart();

    return this;
  }, 100);

  public destroy(): void {
    this.simulation?.stop();
    if (this.app) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.app.stage.removeAllListeners();
        this.canvas.removeEventListener('wheel', this.wheelHandler);
        this.app.destroy(true, { children: true, texture: true });
    }
  }

  public setCullingEnabled(enabled: boolean): ObsiGraph {
    this.cullingEnabled = enabled;
    this.hasChanged = true;

    return this;
  }

  public setCullingMargin(margin: number): ObsiGraph {
    if(this.options.culling) this.options.culling.margin = margin;
    this.hasChanged = true;

    return this;
    }

  public getCullingStats(): {
    totalNodes: number;
    visibleNodes: number;
    totalEdges: number;
    visibleEdges: number;
    cullingEnabled: boolean;
    } {
    return {
      totalNodes: this.nodes.length,
      visibleNodes: this.visibleNodes.size,
      totalEdges: this.edges.length,
      visibleEdges: this.visibleEdges.size,
      cullingEnabled: this.cullingEnabled
    };
  }
}