import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import Dashboard from "@/pages/dashboard";
import Conversations from "@/pages/conversations";
import QuestionBank from "@/pages/question-bank";
import Configuration from "@/pages/configuration";
import { KnowledgeGraphPage } from "@/pages/KnowledgeGraphPage";
import ChatTestPage from "@/pages/chat-test";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/conversations" component={Conversations} />
          <Route path="/questions" component={QuestionBank} />
          <Route path="/knowledge-graph" component={KnowledgeGraphPage} />
          <Route path="/chat-test" component={ChatTestPage} />
          <Route path="/configuration" component={Configuration} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
