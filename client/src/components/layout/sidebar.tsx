import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChartLine, 
  MessageCircle, 
  HelpCircle, 
  Settings, 
  Brain, 
  Shield, 
  User,
  MessageSquare,
  Network
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: ChartLine,
    badge: null
  },
  {
    name: "Conversations", 
    href: "/conversations",
    icon: MessageCircle,
    badge: null
  },
  {
    name: "Question Bank",
    href: "/questions", 
    icon: HelpCircle,
    badge: null
  },
  {
    name: "Knowledge Graph",
    href: "/knowledge-graph",
    icon: Network,
    badge: null
  },
  {
    name: "Chat Testing",
    href: "/chat-test",
    icon: MessageSquare,
    badge: "New"
  }
];

const systemNavigation = [
  {
    name: "Configuration",
    href: "/configuration",
    icon: Settings,
    badge: null
  },
  {
    name: "AI Models",
    href: "/ai-models",
    icon: Brain,
    badge: "Soon"
  },
  {
    name: "Security",
    href: "/security",
    icon: Shield,
    badge: "Soon"
  }
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col" data-testid="sidebar">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Brain className="text-primary-foreground text-sm" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" data-testid="app-title">ConversaAI</h1>
            <p className="text-xs text-muted-foreground">v1.2.3</p>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Main
          </h3>
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start",
                    isActive && "bg-accent text-accent-foreground"
                  )}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                  {item.badge && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              </Link>
            );
          })}
        </div>
        
        <div className="space-y-1 pt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            System
          </h3>
          {systemNavigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start",
                    isActive && "bg-accent text-accent-foreground",
                    item.badge && "opacity-60"
                  )}
                  disabled={!!item.badge}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.name}
                  {item.badge && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              </Link>
            );
          })}
        </div>
      </nav>
      
      {/* User Info */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
            <User className="text-muted-foreground text-sm" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium" data-testid="user-name">Admin User</p>
            <p className="text-xs text-muted-foreground" data-testid="user-role">System Admin</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
