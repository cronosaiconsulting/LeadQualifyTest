import { storage } from "../storage";
import type { Experiment, ShadowDecision } from "@shared/schema";

export interface SafetyConfig {
  resourceLimits: {
    maxConcurrentExperiments: number;
    maxShadowDecisionsPerSecond: number;
    maxMemoryUsageMB: number;
    maxCpuUsagePercent: number;
    maxExecutionTimeMs: number;
  };
  
  circuitBreaker: {
    errorThreshold: number; // Percentage (0-100)
    consecutiveFailureLimit: number;
    recoveryTimeMs: number;
    monitoringWindowMs: number;
  };
  
  productionIsolation: {
    allowProductionModification: boolean;
    shadowOnlyMode: boolean;
    databaseIsolation: boolean;
    networkIsolation: boolean;
  };
  
  emergencyStops: {
    maxLatencyMs: number; // Emergency stop if production latency increases
    maxErrorRate: number; // Emergency stop if production error rate increases
    maxResourceUsage: number; // Emergency stop if resource usage exceeds limit
    emergencyContactEnabled: boolean;
  };
  
  monitoring: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enablePerformanceMetrics: boolean;
    enableDetailedLogging: boolean;
    auditTrail: boolean;
  };
}

export interface SafetyStatus {
  status: 'safe' | 'warning' | 'critical' | 'emergency_stop';
  timestamp: Date;
  checks: {
    resourceUsage: SafetyCheck;
    circuitBreakerStatus: SafetyCheck;
    productionIsolation: SafetyCheck;
    performanceImpact: SafetyCheck;
    errorRates: SafetyCheck;
  };
  activeExperiments: number;
  recentDecisions: number;
  emergencyStopTriggered: boolean;
  warnings: string[];
  criticalIssues: string[];
}

export interface SafetyCheck {
  status: 'pass' | 'warning' | 'fail';
  value: number;
  threshold: number;
  message: string;
  lastChecked: Date;
}

export interface ResourceMetrics {
  memoryUsageMB: number;
  cpuUsagePercent: number;
  diskUsageMB: number;
  networkLatencyMs: number;
  activeConnections: number;
  shadowDecisionsRate: number;
}

export interface CircuitBreakerState {
  experimentId: string;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: Date | null;
  nextRetryTime: Date | null;
  errorRate: number;
  totalRequests: number;
}

export class SafetyService {
  private config: SafetyConfig;
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private emergencyStopActive: boolean = false;
  private lastResourceCheck: Date = new Date();
  private resourceMetrics: ResourceMetrics | null = null;
  private safetyHistory: SafetyStatus[] = [];
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuCheckTime: number = 0;
  private cachedActiveExperiments: { count: number; lastUpdated: number } = { count: 0, lastUpdated: 0 };
  private cachedShadowDecisions: { rate: number; lastUpdated: number } = { rate: 0, lastUpdated: 0 };
  private resourceMonitoringBackoff: number = 10000; // Start with 10 seconds
  private maxBackoff: number = 60000; // Max 1 minute
  private resourceMonitoringErrors: number = 0;

  constructor() {
    this.config = this.getDefaultSafetyConfig();
    this.initializeSafetyMonitoring();
  }

  /**
   * Perform comprehensive safety check before allowing shadow decision execution
   */
  async performPreExecutionSafetyCheck(experimentId: string, conversationId: string): Promise<{
    allowed: boolean;
    reason?: string;
    safetyStatus: SafetyStatus;
  }> {
    // Emergency stop check first
    if (this.emergencyStopActive) {
      return {
        allowed: false,
        reason: 'Emergency stop is active - shadow testing suspended',
        safetyStatus: await this.getComprehensiveSafetyStatus()
      };
    }

    // Circuit breaker check
    const circuitBreakerCheck = this.checkCircuitBreaker(experimentId);
    if (!circuitBreakerCheck.allowed) {
      return {
        allowed: false,
        reason: circuitBreakerCheck.reason,
        safetyStatus: await this.getComprehensiveSafetyStatus()
      };
    }

    // Resource limits check
    const resourceCheck = await this.checkResourceLimits();
    if (!resourceCheck.allowed) {
      return {
        allowed: false,
        reason: resourceCheck.reason,
        safetyStatus: await this.getComprehensiveSafetyStatus()
      };
    }

    // Production isolation check
    const isolationCheck = this.checkProductionIsolation();
    if (!isolationCheck.allowed) {
      return {
        allowed: false,
        reason: isolationCheck.reason,
        safetyStatus: await this.getComprehensiveSafetyStatus()
      };
    }

    return {
      allowed: true,
      safetyStatus: await this.getComprehensiveSafetyStatus()
    };
  }

  /**
   * Record shadow decision execution outcome for safety monitoring
   */
  async recordShadowDecisionOutcome(
    experimentId: string,
    success: boolean,
    executionTimeMs: number,
    errorMessage?: string
  ): Promise<void> {
    // Update circuit breaker state
    this.updateCircuitBreaker(experimentId, success, executionTimeMs);

    // Check for emergency stop conditions
    await this.checkEmergencyStopConditions(executionTimeMs, success);

    // Log outcome for audit trail
    if (this.config.monitoring.auditTrail) {
      await this.logSafetyEvent('shadow_decision_executed', {
        experimentId,
        success,
        executionTimeMs,
        errorMessage,
        timestamp: new Date()
      });
    }

    // Check if experiment should be automatically stopped
    if (!success) {
      await this.evaluateExperimentAutoStop(experimentId, errorMessage);
    }
  }

  /**
   * Get comprehensive safety status
   */
  async getComprehensiveSafetyStatus(): Promise<SafetyStatus> {
    const timestamp = new Date();
    
    // Get resource metrics
    await this.updateResourceMetrics();
    
    // Perform all safety checks
    const resourceUsage = this.checkResourceUsageSafety();
    const circuitBreakerStatus = this.checkAllCircuitBreakers();
    const productionIsolation = this.checkProductionIsolationStatus();
    const performanceImpact = await this.checkPerformanceImpact();
    const errorRates = await this.checkErrorRates();

    // Count active experiments and recent decisions
    const activeExperiments = await this.countActiveExperiments();
    const recentDecisions = await this.countRecentShadowDecisions();

    // Compile warnings and critical issues
    const warnings: string[] = [];
    const criticalIssues: string[] = [];

    [resourceUsage, circuitBreakerStatus, productionIsolation, performanceImpact, errorRates].forEach(check => {
      if (check.status === 'warning') {
        warnings.push(check.message);
      } else if (check.status === 'fail') {
        criticalIssues.push(check.message);
      }
    });

    // Determine overall status
    let status: SafetyStatus['status'] = 'safe';
    if (this.emergencyStopActive) {
      status = 'emergency_stop';
    } else if (criticalIssues.length > 0) {
      status = 'critical';
    } else if (warnings.length > 0) {
      status = 'warning';
    }

    const safetyStatus: SafetyStatus = {
      status,
      timestamp,
      checks: {
        resourceUsage,
        circuitBreakerStatus,
        productionIsolation,
        performanceImpact,
        errorRates
      },
      activeExperiments,
      recentDecisions,
      emergencyStopTriggered: this.emergencyStopActive,
      warnings,
      criticalIssues
    };

    // Store in history
    this.safetyHistory.push(safetyStatus);
    if (this.safetyHistory.length > 100) {
      this.safetyHistory.shift();
    }

    return safetyStatus;
  }

  /**
   * Trigger emergency stop for all shadow testing
   */
  async triggerEmergencyStop(reason: string, triggeredBy: string): Promise<void> {
    this.emergencyStopActive = true;

    // Stop all active experiments
    const activeExperiments = await storage.getActiveExperiments();
    for (const experiment of activeExperiments) {
      try {
        await storage.updateExperiment(experiment.id, {
          status: 'stopped',
          metadata: {
            ...experiment.metadata as any,
            emergencyStop: {
              triggered: true,
              reason,
              triggeredBy,
              timestamp: new Date()
            }
          }
        });
      } catch (error) {
        console.error(`Failed to emergency stop experiment ${experiment.id}:`, error);
      }
    }

    // Log emergency stop
    await this.logSafetyEvent('emergency_stop_triggered', {
      reason,
      triggeredBy,
      activeExperiments: activeExperiments.length,
      timestamp: new Date()
    });

    console.error(`🚨 EMERGENCY STOP TRIGGERED: ${reason} (by: ${triggeredBy})`);
  }

  /**
   * Clear emergency stop if conditions are resolved
   */
  async clearEmergencyStop(clearedBy: string, reason: string): Promise<void> {
    // Perform comprehensive safety check
    const safetyStatus = await this.getComprehensiveSafetyStatus();
    
    if (safetyStatus.criticalIssues.length > 0) {
      throw new Error(`Cannot clear emergency stop while critical issues exist: ${safetyStatus.criticalIssues.join(', ')}`);
    }

    this.emergencyStopActive = false;

    await this.logSafetyEvent('emergency_stop_cleared', {
      clearedBy,
      reason,
      timestamp: new Date()
    });

    console.log(`✅ Emergency stop cleared by ${clearedBy}: ${reason}`);
  }

  /**
   * Configure safety settings
   */
  updateSafetyConfig(newConfig: Partial<SafetyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reset circuit breakers if thresholds changed
    if (newConfig.circuitBreaker) {
      this.circuitBreakers.clear();
    }
  }

  /**
   * Get safety configuration
   */
  getSafetyConfig(): SafetyConfig {
    return { ...this.config };
  }

  /**
   * Get safety history for analysis
   */
  getSafetyHistory(hours: number = 24): SafetyStatus[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.safetyHistory.filter(status => status.timestamp >= cutoff);
  }

  // Private helper methods

  private getDefaultSafetyConfig(): SafetyConfig {
    return {
      resourceLimits: {
        maxConcurrentExperiments: 10,
        maxShadowDecisionsPerSecond: 100,
        maxMemoryUsageMB: 512,
        maxCpuUsagePercent: 20,
        maxExecutionTimeMs: 5000
      },
      circuitBreaker: {
        errorThreshold: 10, // 10% error rate
        consecutiveFailureLimit: 5,
        recoveryTimeMs: 300000, // 5 minutes
        monitoringWindowMs: 60000 // 1 minute
      },
      productionIsolation: {
        allowProductionModification: false,
        shadowOnlyMode: true,
        databaseIsolation: true,
        networkIsolation: true
      },
      emergencyStops: {
        maxLatencyMs: 2000,
        maxErrorRate: 5, // 5%
        maxResourceUsage: 80, // 80%
        emergencyContactEnabled: true
      },
      monitoring: {
        logLevel: 'info',
        enablePerformanceMetrics: true,
        enableDetailedLogging: true,
        auditTrail: true
      }
    };
  }

  private initializeSafetyMonitoring(): void {
    // Start periodic safety checks with exponential backoff
    const scheduleSafetyCheck = () => {
      setTimeout(async () => {
        try {
          await this.performPeriodicSafetyCheck();
          // Reset to normal interval on success
          this.resourceMonitoringBackoff = Math.max(10000, this.resourceMonitoringBackoff * 0.9);
        } catch (error) {
          console.error('Periodic safety check failed:', error);
          // Increase backoff on error
          this.resourceMonitoringBackoff = Math.min(this.maxBackoff, this.resourceMonitoringBackoff * 1.5);
        }
        scheduleSafetyCheck(); // Schedule next check
      }, 30000);
    };

    // Start resource monitoring with adaptive backoff
    const scheduleResourceMonitoring = () => {
      setTimeout(async () => {
        try {
          // Skip monitoring if resource usage is critical to prevent runaway loops
          if (this.resourceMetrics && this.getMaxResourceUsage() > 95) {
            console.warn('Skipping resource monitoring due to critical usage');
            this.resourceMonitoringBackoff = Math.min(this.maxBackoff, this.resourceMonitoringBackoff * 2);
          } else {
            await this.updateResourceMetrics();
            this.resourceMonitoringErrors = 0;
            // Gradually reduce backoff on success
            this.resourceMonitoringBackoff = Math.max(10000, this.resourceMonitoringBackoff * 0.95);
          }
        } catch (error) {
          console.error('Resource monitoring failed:', error);
          this.resourceMonitoringErrors++;
          // Exponential backoff on errors
          this.resourceMonitoringBackoff = Math.min(this.maxBackoff, this.resourceMonitoringBackoff * Math.pow(2, Math.min(this.resourceMonitoringErrors, 4)));
        }
        scheduleResourceMonitoring(); // Schedule next monitoring
      }, this.resourceMonitoringBackoff);
    };

    // Start both monitoring loops
    scheduleSafetyCheck();
    scheduleResourceMonitoring();
  }

  private checkCircuitBreaker(experimentId: string): { allowed: boolean; reason?: string } {
    const circuitBreaker = this.circuitBreakers.get(experimentId);
    
    if (!circuitBreaker) {
      // Initialize circuit breaker for new experiment
      this.circuitBreakers.set(experimentId, {
        experimentId,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null,
        nextRetryTime: null,
        errorRate: 0,
        totalRequests: 0
      });
      return { allowed: true };
    }

    const now = new Date();

    switch (circuitBreaker.state) {
      case 'open':
        if (circuitBreaker.nextRetryTime && now >= circuitBreaker.nextRetryTime) {
          // Move to half-open state
          circuitBreaker.state = 'half_open';
          return { allowed: true };
        }
        return { 
          allowed: false, 
          reason: `Circuit breaker open for experiment ${experimentId}. Retry at ${circuitBreaker.nextRetryTime}`
        };

      case 'half_open':
        // Allow limited requests in half-open state
        return { allowed: true };

      case 'closed':
      default:
        return { allowed: true };
    }
  }

  private async checkResourceLimits(): Promise<{ allowed: boolean; reason?: string }> {
    // Check active experiments
    const activeExperiments = await this.countActiveExperiments();
    if (activeExperiments >= this.config.resourceLimits.maxConcurrentExperiments) {
      return {
        allowed: false,
        reason: `Too many active experiments: ${activeExperiments}/${this.config.resourceLimits.maxConcurrentExperiments}`
      };
    }

    // Check recent decision rate
    const recentRate = await this.getShadowDecisionRate();
    if (recentRate > this.config.resourceLimits.maxShadowDecisionsPerSecond) {
      return {
        allowed: false,
        reason: `Shadow decision rate too high: ${recentRate.toFixed(2)}/${this.config.resourceLimits.maxShadowDecisionsPerSecond} per second`
      };
    }

    // Check resource usage if available
    if (this.resourceMetrics) {
      if (this.resourceMetrics.memoryUsageMB > this.config.resourceLimits.maxMemoryUsageMB) {
        return {
          allowed: false,
          reason: `Memory usage too high: ${this.resourceMetrics.memoryUsageMB}MB/${this.config.resourceLimits.maxMemoryUsageMB}MB`
        };
      }

      if (this.resourceMetrics.cpuUsagePercent > this.config.resourceLimits.maxCpuUsagePercent) {
        return {
          allowed: false,
          reason: `CPU usage too high: ${this.resourceMetrics.cpuUsagePercent}%/${this.config.resourceLimits.maxCpuUsagePercent}%`
        };
      }
    }

    return { allowed: true };
  }

  private checkProductionIsolation(): { allowed: boolean; reason?: string } {
    // Verify shadow-only mode
    if (!this.config.productionIsolation.shadowOnlyMode) {
      return {
        allowed: false,
        reason: 'Shadow-only mode is disabled - production modification risk'
      };
    }

    // Verify production modification is disabled
    if (this.config.productionIsolation.allowProductionModification) {
      return {
        allowed: false,
        reason: 'Production modification is allowed - isolation breach risk'
      };
    }

    return { allowed: true };
  }

  private updateCircuitBreaker(experimentId: string, success: boolean, executionTimeMs: number): void {
    let circuitBreaker = this.circuitBreakers.get(experimentId);
    
    if (!circuitBreaker) {
      circuitBreaker = {
        experimentId,
        state: 'closed',
        failureCount: 0,
        lastFailureTime: null,
        nextRetryTime: null,
        errorRate: 0,
        totalRequests: 0
      };
      this.circuitBreakers.set(experimentId, circuitBreaker);
    }

    circuitBreaker.totalRequests++;

    if (success) {
      // Success - reset failure count in half-open or closed state
      if (circuitBreaker.state === 'half_open') {
        circuitBreaker.state = 'closed';
        circuitBreaker.failureCount = 0;
      }
    } else {
      // Failure
      circuitBreaker.failureCount++;
      circuitBreaker.lastFailureTime = new Date();

      // Calculate error rate over monitoring window
      const windowStart = new Date(Date.now() - this.config.circuitBreaker.monitoringWindowMs);
      // In production, would calculate based on actual recent requests
      circuitBreaker.errorRate = (circuitBreaker.failureCount / circuitBreaker.totalRequests) * 100;

      // Check if circuit breaker should open
      const shouldOpen = 
        circuitBreaker.failureCount >= this.config.circuitBreaker.consecutiveFailureLimit ||
        circuitBreaker.errorRate >= this.config.circuitBreaker.errorThreshold;

      if (shouldOpen && circuitBreaker.state !== 'open') {
        circuitBreaker.state = 'open';
        circuitBreaker.nextRetryTime = new Date(Date.now() + this.config.circuitBreaker.recoveryTimeMs);
        
        console.warn(`🔒 Circuit breaker opened for experiment ${experimentId} (failures: ${circuitBreaker.failureCount}, error rate: ${circuitBreaker.errorRate.toFixed(2)}%)`);
      }
    }
  }

  private async checkEmergencyStopConditions(executionTimeMs: number, success: boolean): Promise<void> {
    // Check execution time
    if (executionTimeMs > this.config.emergencyStops.maxLatencyMs) {
      await this.triggerEmergencyStop(
        `Shadow decision execution time exceeded limit: ${executionTimeMs}ms > ${this.config.emergencyStops.maxLatencyMs}ms`,
        'automatic_latency_check'
      );
      return;
    }

    // Check overall error rate
    const recentDecisions = await this.getRecentShadowDecisionStats();
    if (recentDecisions.totalCount > 10 && recentDecisions.errorRate > this.config.emergencyStops.maxErrorRate) {
      await this.triggerEmergencyStop(
        `Shadow decision error rate exceeded limit: ${recentDecisions.errorRate.toFixed(2)}% > ${this.config.emergencyStops.maxErrorRate}%`,
        'automatic_error_check'
      );
      return;
    }

    // Check resource usage
    if (this.resourceMetrics) {
      const totalResourceUsage = Math.max(
        this.resourceMetrics.cpuUsagePercent,
        (this.resourceMetrics.memoryUsageMB / this.config.resourceLimits.maxMemoryUsageMB) * 100
      );
      
      if (totalResourceUsage > this.config.emergencyStops.maxResourceUsage) {
        await this.triggerEmergencyStop(
          `Resource usage exceeded emergency limit: ${totalResourceUsage.toFixed(2)}% > ${this.config.emergencyStops.maxResourceUsage}%`,
          'automatic_resource_check'
        );
        return;
      }
    }
  }

  private async evaluateExperimentAutoStop(experimentId: string, errorMessage?: string): Promise<void> {
    const circuitBreaker = this.circuitBreakers.get(experimentId);
    
    if (circuitBreaker && circuitBreaker.state === 'open') {
      // Consider stopping the experiment if circuit breaker opens
      const experiment = await storage.getExperiment(experimentId);
      if (experiment && experiment.status === 'running') {
        console.warn(`⚠️ Considering auto-stop for experiment ${experimentId} due to circuit breaker opening`);
        
        // Log for manual review - don't auto-stop immediately
        await this.logSafetyEvent('experiment_auto_stop_candidate', {
          experimentId,
          reason: 'Circuit breaker opened',
          errorMessage,
          failureCount: circuitBreaker.failureCount,
          errorRate: circuitBreaker.errorRate,
          timestamp: new Date()
        });
      }
    }
  }

  private async performPeriodicSafetyCheck(): Promise<void> {
    try {
      const safetyStatus = await this.getComprehensiveSafetyStatus();
      
      // Log warnings and critical issues
      if (safetyStatus.warnings.length > 0) {
        console.warn('🟡 Safety warnings:', safetyStatus.warnings);
      }
      
      if (safetyStatus.criticalIssues.length > 0) {
        console.error('🔴 Critical safety issues:', safetyStatus.criticalIssues);
      }

      // Auto-trigger emergency stop for critical issues if configured
      if (safetyStatus.criticalIssues.length > 0 && !this.emergencyStopActive) {
        await this.triggerEmergencyStop(
          `Critical safety issues detected: ${safetyStatus.criticalIssues.join(', ')}`,
          'automatic_safety_check'
        );
      }
    } catch (error) {
      console.error('Periodic safety check error:', error);
    }
  }

  private getMaxResourceUsage(): number {
    if (!this.resourceMetrics) return 0;
    
    const memoryPercent = (this.resourceMetrics.memoryUsageMB / this.config.resourceLimits.maxMemoryUsageMB) * 100;
    const cpuPercent = this.resourceMetrics.cpuUsagePercent;
    return Math.max(memoryPercent, cpuPercent);
  }

  private checkResourceUsageSafety(): SafetyCheck {
    if (!this.resourceMetrics) {
      return {
        status: 'warning',
        value: 0,
        threshold: 0,
        message: 'Resource metrics not available',
        lastChecked: new Date()
      };
    }

    const memoryPercent = (this.resourceMetrics.memoryUsageMB / this.config.resourceLimits.maxMemoryUsageMB) * 100;
    const cpuPercent = this.resourceMetrics.cpuUsagePercent;
    const maxUsage = Math.max(memoryPercent, cpuPercent);

    let status: SafetyCheck['status'] = 'pass';
    let message = 'Resource usage within limits';

    // More conservative thresholds to prevent runaway loops
    if (maxUsage > 80) {
      status = 'fail';
      message = `Critical resource usage: ${maxUsage.toFixed(2)}% (Memory: ${memoryPercent.toFixed(1)}%, CPU: ${cpuPercent.toFixed(1)}%)`;
    } else if (maxUsage > 60) {
      status = 'warning';
      message = `High resource usage: ${maxUsage.toFixed(2)}% (Memory: ${memoryPercent.toFixed(1)}%, CPU: ${cpuPercent.toFixed(1)}%)`;
    }

    return {
      status,
      value: maxUsage,
      threshold: 80, // Lower threshold for better safety
      message,
      lastChecked: new Date()
    };
  }

  private checkAllCircuitBreakers(): SafetyCheck {
    const openCircuitBreakers = Array.from(this.circuitBreakers.values())
      .filter(cb => cb.state === 'open');

    const totalCircuitBreakers = this.circuitBreakers.size;
    const openPercentage = totalCircuitBreakers > 0 ? 
      (openCircuitBreakers.length / totalCircuitBreakers) * 100 : 0;

    let status: SafetyCheck['status'] = 'pass';
    let message = 'All circuit breakers operational';

    if (openPercentage > 50) {
      status = 'fail';
      message = `${openCircuitBreakers.length}/${totalCircuitBreakers} circuit breakers open`;
    } else if (openPercentage > 20) {
      status = 'warning';
      message = `${openCircuitBreakers.length}/${totalCircuitBreakers} circuit breakers open`;
    }

    return {
      status,
      value: openPercentage,
      threshold: 50,
      message,
      lastChecked: new Date()
    };
  }

  private checkProductionIsolationStatus(): SafetyCheck {
    const isolationScore = [
      this.config.productionIsolation.shadowOnlyMode,
      !this.config.productionIsolation.allowProductionModification,
      this.config.productionIsolation.databaseIsolation,
      this.config.productionIsolation.networkIsolation
    ].filter(Boolean).length;

    const maxScore = 4;
    const percentage = (isolationScore / maxScore) * 100;

    let status: SafetyCheck['status'] = 'pass';
    let message = 'Production isolation fully enabled';

    if (percentage < 75) {
      status = 'fail';
      message = `Insufficient production isolation: ${isolationScore}/${maxScore} checks passing`;
    } else if (percentage < 100) {
      status = 'warning';
      message = `Partial production isolation: ${isolationScore}/${maxScore} checks passing`;
    }

    return {
      status,
      value: percentage,
      threshold: 100,
      message,
      lastChecked: new Date()
    };
  }

  private async checkPerformanceImpact(): Promise<SafetyCheck> {
    // Check average execution time of recent shadow decisions
    const stats = await this.getRecentShadowDecisionStats();
    
    let status: SafetyCheck['status'] = 'pass';
    let message = 'Performance impact minimal';

    if (stats.avgExecutionTime > 1000) {
      status = 'fail';
      message = `High shadow execution time: ${stats.avgExecutionTime.toFixed(2)}ms`;
    } else if (stats.avgExecutionTime > 500) {
      status = 'warning';
      message = `Elevated shadow execution time: ${stats.avgExecutionTime.toFixed(2)}ms`;
    }

    return {
      status,
      value: stats.avgExecutionTime,
      threshold: 1000,
      message,
      lastChecked: new Date()
    };
  }

  private async checkErrorRates(): Promise<SafetyCheck> {
    const stats = await this.getRecentShadowDecisionStats();
    
    let status: SafetyCheck['status'] = 'pass';
    let message = 'Error rates within acceptable limits';

    if (stats.errorRate > 15) {
      status = 'fail';
      message = `High error rate: ${stats.errorRate.toFixed(2)}%`;
    } else if (stats.errorRate > 5) {
      status = 'warning';
      message = `Elevated error rate: ${stats.errorRate.toFixed(2)}%`;
    }

    return {
      status,
      value: stats.errorRate,
      threshold: 15,
      message,
      lastChecked: new Date()
    };
  }

  private async updateResourceMetrics(): Promise<void> {
    // Get Node.js process metrics
    const memUsage = process.memoryUsage();
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();

    // Calculate CPU percentage correctly using time delta
    let cpuPercent = 0;
    if (this.lastCpuUsage && this.lastCpuCheckTime) {
      const timeDelta = (currentTime - this.lastCpuCheckTime) * 1000; // Convert to microseconds
      const userDelta = currentCpuUsage.user - this.lastCpuUsage.user;
      const systemDelta = currentCpuUsage.system - this.lastCpuUsage.system;
      
      if (timeDelta > 0) {
        cpuPercent = Math.min(((userDelta + systemDelta) / timeDelta) * 100, 100);
      }
    }

    // Store current values for next calculation
    this.lastCpuUsage = currentCpuUsage;
    this.lastCpuCheckTime = currentTime;

    // Get cached metrics to reduce database load
    const shadowRate = await this.getCachedShadowDecisionRate();

    this.resourceMetrics = {
      memoryUsageMB: memUsage.heapUsed / (1024 * 1024),
      cpuUsagePercent: cpuPercent,
      diskUsageMB: 0, // Would implement actual disk usage check
      networkLatencyMs: 0, // Would implement actual network latency check
      activeConnections: 0, // Would implement actual connection count
      shadowDecisionsRate: shadowRate
    };

    this.lastResourceCheck = new Date();
  }

  private async countActiveExperiments(): Promise<number> {
    try {
      const now = Date.now();
      // Use cached value if less than 30 seconds old
      if (now - this.cachedActiveExperiments.lastUpdated < 30000) {
        return this.cachedActiveExperiments.count;
      }

      const experiments = await storage.getActiveExperiments();
      this.cachedActiveExperiments = {
        count: experiments.length,
        lastUpdated: now
      };
      return experiments.length;
    } catch (error) {
      console.error('Failed to count active experiments:', error);
      // Return cached value on error if available
      return this.cachedActiveExperiments.count || 0;
    }
  }

  private async countRecentShadowDecisions(): Promise<number> {
    try {
      const recentDecisions = await storage.getShadowDecisions(undefined, undefined, 100);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return recentDecisions.filter(d => d.timestamp >= oneHourAgo).length;
    } catch (error) {
      console.error('Failed to count recent shadow decisions:', error);
      return 0;
    }
  }

  private async getCachedShadowDecisionRate(): Promise<number> {
    try {
      const now = Date.now();
      // Use cached value if less than 60 seconds old
      if (now - this.cachedShadowDecisions.lastUpdated < 60000) {
        return this.cachedShadowDecisions.rate;
      }

      const recentDecisions = await storage.getShadowDecisions(undefined, undefined, 50); // Reduce query size
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentCount = recentDecisions.filter(d => d.timestamp >= oneMinuteAgo).length;
      
      this.cachedShadowDecisions = {
        rate: recentCount,
        lastUpdated: now
      };
      return recentCount;
    } catch (error) {
      console.error('Failed to calculate shadow decision rate:', error);
      // Return cached value on error if available
      return this.cachedShadowDecisions.rate || 0;
    }
  }

  private async getShadowDecisionRate(): Promise<number> {
    return this.getCachedShadowDecisionRate();
  }

  private async getRecentShadowDecisionStats(): Promise<{
    totalCount: number;
    errorCount: number;
    errorRate: number;
    avgExecutionTime: number;
  }> {
    try {
      const recentDecisions = await storage.getShadowDecisions(undefined, undefined, 100);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const relevantDecisions = recentDecisions.filter(d => d.timestamp >= oneHourAgo);

      const totalCount = relevantDecisions.length;
      const errorCount = relevantDecisions.filter(d => d.errorOccurred).length;
      const errorRate = totalCount > 0 ? (errorCount / totalCount) * 100 : 0;
      
      const executionTimes = relevantDecisions
        .map(d => d.executionTimeMs || 0)
        .filter(time => time > 0);
      
      const avgExecutionTime = executionTimes.length > 0 ? 
        executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length : 0;

      return {
        totalCount,
        errorCount,
        errorRate,
        avgExecutionTime
      };
    } catch (error) {
      console.error('Failed to get shadow decision stats:', error);
      return {
        totalCount: 0,
        errorCount: 0,
        errorRate: 0,
        avgExecutionTime: 0
      };
    }
  }

  private async logSafetyEvent(eventType: string, data: any): Promise<void> {
    if (this.config.monitoring.enableDetailedLogging) {
      console.log(`🔒 Safety Event [${eventType}]:`, JSON.stringify(data, null, 2));
    }

    // In production, would persist to audit log
    // await storage.logSafetyEvent(eventType, data);
  }
}

export const safetyService = new SafetyService();