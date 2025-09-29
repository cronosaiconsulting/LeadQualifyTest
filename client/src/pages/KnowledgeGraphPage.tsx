import { KnowledgeGraphViewer } from '@/components/KnowledgeGraphViewer';

export function KnowledgeGraphPage() {
  return (
    <div className="container mx-auto p-6 h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Knowledge Graph
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Explore entity relationships and conversation patterns from your B2B lead qualification system
        </p>
      </div>
      
      <div className="h-[calc(100vh-150px)]">
        <KnowledgeGraphViewer showInsights={true} />
      </div>
    </div>
  );
}