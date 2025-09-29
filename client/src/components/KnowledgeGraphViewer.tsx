import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { 
  Network, 
  Eye, 
  Filter, 
  Search, 
  TrendingUp, 
  Users, 
  Building2, 
  Zap,
  BarChart3,
  RefreshCw,
  Download
} from 'lucide-react';
import Graph from 'graphology';
import FA2Layout from 'graphology-layout-forceatlas2/worker';

interface GraphNode {
  id: string;
  entityType: 'company' | 'person' | 'technology' | 'industry' | 'budget';
  entityName: string;
  attributes: Record<string, any>;
  confidence: number;
  lastUpdated: string;
  extractionCount: number;
  successRate?: number;
}

interface GraphEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  confidence: number;
  conversationCount: number;
  successfulOutcomes: number;
}

interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  edgesByType: Record<string, number>;
  qualityScore: number;
  lastUpdated: string;
}

interface KnowledgeGraphViewerProps {
  conversationId?: string;
  entityId?: string;
  showInsights?: boolean;
}

export function KnowledgeGraphViewer({ 
  conversationId, 
  entityId, 
  showInsights = true 
}: KnowledgeGraphViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [filters, setFilters] = useState({
    entityType: 'all',
    industry: 'all',
    minConfidence: 0.6,
    outcomeType: 'all',
    searchTerm: ''
  });
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [graphInstance, setGraphInstance] = useState<Graph | null>(null);

  // Fetch knowledge graph statistics
  const { data: graphStats, isLoading: statsLoading } = useQuery<GraphStats>({
    queryKey: ['/api/knowledge/stats'],
  });

  // Fetch graph nodes based on filters
  const { data: graphData, isLoading: dataLoading, refetch } = useQuery({
    queryKey: ['/api/knowledge/graph-data', filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        entityType: filters.entityType !== 'all' ? filters.entityType : '',
        minConfidence: filters.minConfidence.toString(),
        limit: '100'
      });
      
      const response = await fetch(`/api/knowledge/graph-data?${params}`);
      if (!response.ok) throw new Error('Failed to fetch graph data');
      return response.json();
    }
  });

  // Fetch entity insights if specific entity is selected
  const { data: entityInsights } = useQuery({
    queryKey: ['/api/knowledge/entity-insights', selectedNode?.id],
    queryFn: async () => {
      if (!selectedNode?.id) return null;
      const response = await fetch(`/api/knowledge/entity-insights/${selectedNode.id}`);
      if (!response.ok) throw new Error('Failed to fetch entity insights');
      return response.json();
    },
    enabled: !!selectedNode?.id
  });

  // Initialize and update graph visualization
  useEffect(() => {
    if (!canvasRef.current || !graphData) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create new graph instance
    const graph = new Graph();
    setGraphInstance(graph);

    // Add nodes
    graphData.nodes?.forEach((node: GraphNode) => {
      if (filters.searchTerm && 
          !node.entityName.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
        return;
      }

      graph.addNode(node.id, {
        label: node.entityName,
        type: node.entityType,
        confidence: node.confidence,
        size: Math.max(5, node.extractionCount * 2),
        color: getNodeColor(node.entityType, node.confidence),
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height
      });
    });

    // Add edges
    graphData.edges?.forEach((edge: GraphEdge) => {
      if (graph.hasNode(edge.sourceEntityId) && graph.hasNode(edge.targetEntityId)) {
        graph.addEdge(edge.sourceEntityId, edge.targetEntityId, {
          type: edge.relationshipType,
          confidence: edge.confidence,
          weight: edge.conversationCount,
          successRate: edge.successfulOutcomes / edge.conversationCount,
          color: getEdgeColor(edge.confidence, edge.successfulOutcomes / edge.conversationCount)
        });
      }
    });

    // Apply initial random layout
    graph.forEachNode((node) => {
      graph.setNodeAttribute(node, 'x', Math.random() * canvas.width);
      graph.setNodeAttribute(node, 'y', Math.random() * canvas.height);
    });

    // Setup force atlas layout
    const fa2 = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
        barnesHutOptimize: true
      }
    });

    // Render function
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw edges
      graph.forEachEdge((edge, attributes, source, target) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        const targetAttrs = graph.getNodeAttributes(target);
        
        ctx.beginPath();
        ctx.moveTo(sourceAttrs.x, sourceAttrs.y);
        ctx.lineTo(targetAttrs.x, targetAttrs.y);
        ctx.strokeStyle = attributes.color;
        ctx.lineWidth = Math.max(1, attributes.weight / 5);
        ctx.globalAlpha = attributes.confidence;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Draw nodes
      graph.forEachNode((node, attributes) => {
        ctx.beginPath();
        ctx.arc(attributes.x, attributes.y, attributes.size, 0, Math.PI * 2);
        ctx.fillStyle = attributes.color;
        ctx.fill();
        
        // Draw node border
        ctx.strokeStyle = selectedNode?.id === node ? '#fff' : '#333';
        ctx.lineWidth = selectedNode?.id === node ? 3 : 1;
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#000';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(
          attributes.label.length > 15 ? 
            attributes.label.substring(0, 15) + '...' : 
            attributes.label,
          attributes.x,
          attributes.y + attributes.size + 15
        );
      });
    };

    // Handle canvas clicks
    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Find clicked node
      let clickedNode: string | null = null;
      graph.forEachNode((node, attributes) => {
        const distance = Math.sqrt(
          Math.pow(x - attributes.x, 2) + Math.pow(y - attributes.y, 2)
        );
        if (distance <= attributes.size) {
          clickedNode = node;
        }
      });

      if (clickedNode) {
        const nodeData = graphData.nodes?.find((n: GraphNode) => n.id === clickedNode);
        setSelectedNode(nodeData || null);
      } else {
        setSelectedNode(null);
      }
    };

    canvas.addEventListener('click', handleClick);

    // Start layout animation
    setLayoutRunning(true);
    let iterations = 0;
    const maxIterations = 300;

    const animate = () => {
      if (iterations < maxIterations) {
        // Force atlas layout iterations are handled internally
        render();
        iterations++;
        requestAnimationFrame(animate);
      } else {
        setLayoutRunning(false);
        if (fa2) fa2.kill();
      }
    };

    animate();

    return () => {
      canvas.removeEventListener('click', handleClick);
      if (fa2) fa2.kill();
    };
  }, [graphData, filters, selectedNode]);

  // Utility functions
  const getNodeColor = (entityType: string, confidence: number): string => {
    const baseColors = {
      company: '#3b82f6',
      person: '#10b981',
      technology: '#8b5cf6',
      industry: '#f59e0b',
      budget: '#ef4444'
    };
    
    const baseColor = baseColors[entityType as keyof typeof baseColors] || '#6b7280';
    const alpha = Math.max(0.3, confidence);
    
    // Convert hex to rgba
    const hex = baseColor.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const getEdgeColor = (confidence: number, successRate: number): string => {
    // Green for high success rate, red for low, yellow for medium
    if (successRate > 0.7) return `rgba(34, 197, 94, ${confidence})`;
    if (successRate < 0.3) return `rgba(239, 68, 68, ${confidence})`;
    return `rgba(245, 158, 11, ${confidence})`;
  };

  const exportGraph = () => {
    if (!graphInstance) return;
    
    const graphData = {
      nodes: [],
      edges: [],
      metadata: {
        exportedAt: new Date().toISOString(),
        totalNodes: graphInstance.order,
        totalEdges: graphInstance.size,
        filters
      }
    };
    
    const blob = new Blob([JSON.stringify(graphData, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `knowledge-graph-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full space-y-4" data-testid="knowledge-graph-viewer">
      {/* Header with controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white dark:bg-gray-900 rounded-lg border">
        <div className="flex items-center space-x-2">
          <Network className="w-5 h-5 text-blue-600" />
          <h2 className="text-xl font-semibold" data-testid="graph-title">Knowledge Graph</h2>
          {statsLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={dataLoading}
            data-testid="button-refresh-graph"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${dataLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={exportGraph}
            disabled={!graphInstance}
            data-testid="button-export-graph"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Statistics overview */}
      {graphStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-nodes">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{graphStats?.totalNodes || 0}</div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-total-edges">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{graphStats?.totalEdges || 0}</div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-quality-score">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Quality Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">
                {((graphStats?.qualityScore || 0) * 100).toFixed(1)}%
              </div>
            </CardContent>
          </Card>
          
          <Card data-testid="card-pipeline-status">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={(graphStats as any)?.pipelineStatus?.isProcessing ? "default" : "secondary"}>
                {(graphStats as any)?.pipelineStatus?.isProcessing ? 'Processing' : 'Idle'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Filters sidebar */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Search</label>
              <Input
                placeholder="Search entities..."
                value={filters.searchTerm}
                onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                data-testid="input-search-entities"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Entity Type</label>
              <Select 
                value={filters.entityType} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, entityType: value }))}
              >
                <SelectTrigger data-testid="select-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="company">Companies</SelectItem>
                  <SelectItem value="person">People</SelectItem>
                  <SelectItem value="technology">Technology</SelectItem>
                  <SelectItem value="industry">Industry</SelectItem>
                  <SelectItem value="budget">Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">
                Min Confidence: {filters.minConfidence}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.minConfidence}
                onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                className="w-full"
                data-testid="slider-min-confidence"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Outcome Filter</label>
              <Select 
                value={filters.outcomeType} 
                onValueChange={(value) => setFilters(prev => ({ ...prev, outcomeType: value }))}
              >
                <SelectTrigger data-testid="select-outcome-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="unqualified">Unqualified</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {layoutRunning && (
              <div className="text-sm text-gray-500 flex items-center" data-testid="text-layout-status">
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Layout calculating...
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main graph visualization */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Graph Visualization</CardTitle>
            <CardDescription>
              Interactive knowledge graph showing entity relationships and success patterns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className="border rounded-lg w-full h-auto bg-gray-50 dark:bg-gray-800"
                data-testid="canvas-knowledge-graph"
              />
              
              {dataLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Loading graph data...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected node/edge details */}
      {(selectedNode || selectedEdge) && (
        <Card data-testid="card-selected-details">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Eye className="w-4 h-4 mr-2" />
              {selectedNode ? 'Entity Details' : 'Relationship Details'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {selectedNode && <TabsTrigger value="insights">Insights</TabsTrigger>}
                {selectedNode && <TabsTrigger value="relationships">Relationships</TabsTrigger>}
              </TabsList>
              
              <TabsContent value="overview" className="space-y-4">
                {selectedNode && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Entity Name</label>
                      <p className="text-lg" data-testid="text-entity-name">{selectedNode.entityName}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Type</label>
                      <Badge variant="outline" data-testid="badge-entity-type">{selectedNode.entityType}</Badge>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Confidence</label>
                      <p data-testid="text-entity-confidence">{(selectedNode.confidence * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Mentions</label>
                      <p data-testid="text-entity-mentions">{selectedNode.extractionCount}</p>
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {selectedNode && entityInsights && (
                <TabsContent value="insights" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Success Rate</label>
                      <p className="text-lg text-green-600" data-testid="text-success-rate">
                        {(entityInsights.successMetrics?.qualificationRate * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Avg Deal Size</label>
                      <p className="text-lg" data-testid="text-avg-deal-size">
                        ${entityInsights.successMetrics?.averageDealSize?.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  
                  {entityInsights.conversationHistory?.length > 0 && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">Recent Conversations</label>
                      <div className="space-y-2">
                        {entityInsights.conversationHistory.slice(0, 3).map((item: string, index: number) => (
                          <p key={index} className="text-sm text-gray-600 dark:text-gray-400" data-testid={`text-conversation-${index}`}>
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}