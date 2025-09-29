import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

interface HeaderProps {
  title: string;
  subtitle: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: systemStatus } = useQuery({
    queryKey: ['/api/health'],
    refetchInterval: 30000
  });

  const currentTime = new Date().toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'Europe/Madrid'
  });

  const isHealthy = systemStatus?.status === 'healthy';

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6" data-testid="header">
      <div>
        <h2 className="text-xl font-semibold" data-testid="page-title">{title}</h2>
        <p className="text-sm text-muted-foreground" data-testid="page-subtitle">{subtitle}</p>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-muted-foreground" data-testid="system-status">
            {isHealthy ? 'System Healthy' : 'System Issues'}
          </span>
        </div>
        
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <i className="fas fa-clock" />
          <span data-testid="current-time">{currentTime} CET</span>
        </div>
      </div>
    </header>
  );
}
