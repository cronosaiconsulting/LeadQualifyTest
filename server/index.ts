import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { tracingService } from "./services/tracing";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Enhanced request tracing middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  
  // Generate traceId for this request
  const traceId = tracingService.startTrace(
    `${req.method}_${path}`,
    req.headers['x-conversation-id'] as string || 'system',
    {
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      headers: tracingService.scrubSensitiveData(req.headers)
    }
  );
  
  // Attach traceId to request for downstream use
  (req as any).traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    
    // Record performance metrics
    tracingService.recordLatency(req.method, path, duration);
    
    if (path.startsWith("/api")) {
      // Structured logging with trace context
      const logData = {
        traceId,
        method: req.method,
        path,
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString(),
        response: capturedJsonResponse ? tracingService.scrubSensitiveData(capturedJsonResponse) : undefined
      };
      
      tracingService.logStructured('info', 'http_request_completed', logData);
      
      // Legacy log format for backwards compatibility
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
    
    // Finish the trace
    tracingService.finishTrace(traceId);
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
