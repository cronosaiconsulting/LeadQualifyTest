import { Header } from "@/components/layout/header";
import { MetricsOverview } from "@/components/dashboard/metrics-overview";
import { DimensionCards } from "@/components/dashboard/dimension-cards";
import { AiStatus } from "@/components/dashboard/ai-status";
import { DecisionTraces } from "@/components/dashboard/decision-traces";
import { ConversationPanel } from "@/components/dashboard/conversation-panel";

export default function Dashboard() {
  return (
    <>
      <Header 
        title="Situation Awareness Dashboard"
        subtitle="Real-time B2B lead qualification monitoring"
      />
      <div className="flex-1 flex">
        <main className="flex-1 p-6 overflow-y-auto">
          <MetricsOverview />
          <DimensionCards />
          <AiStatus />
          <DecisionTraces />
        </main>
        <ConversationPanel />
      </div>
    </>
  );
}
