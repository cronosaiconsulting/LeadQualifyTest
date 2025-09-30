import type {
  SituationAwarenessState,
  ConversationMetrics,
  InsertConversationMetrics,
  Message
} from "@shared/schema";
import { openaiService } from "./openai";
import { grokNLPService, type MessageAnalysis } from "./grok-nlp";

export interface MetricCalculationResult {
  metrics: InsertConversationMetrics;
  explanations: Record<string, string>;
  confidences: Record<string, number>;
  grokAnalysis?: MessageAnalysis; // Include Grok NLP analysis
}

export interface SMBMetrics {
  budgetQualification: number;
  spocAvailability: number;
  digitalMaturity: number;
  smbFitScore: number;
  budgetConfidence: number;
  spocConfidence: number;
  maturityConfidence: number;
}

export class MetricsService {
  private baselineWords = 20; // Expected words per message
  private baselineResponseTime = 300; // 5 minutes in seconds

  async calculateMetrics(
    conversationId: string,
    messages: Message[],
    previousMetrics?: ConversationMetrics
  ): Promise<MetricCalculationResult> {
    
    const messageCount = messages.length;
    const userMessages = messages.filter(m => m.direction === 'incoming');
    const systemMessages = messages.filter(m => m.direction === 'outgoing');

    // Analyze latest user message with Grok NLP (Castilian Spanish)
    const latestUserMessage = userMessages[userMessages.length - 1];
    let messageAnalysis = null;
    let grokAnalysis: MessageAnalysis | null = null;

    if (latestUserMessage) {
      // Use Grok for Spanish B2B NLP analysis
      const conversationHistory = messages.slice(-4).map(m => m.content);
      grokAnalysis = await grokNLPService.analyzeMessage(
        latestUserMessage.content,
        conversationHistory
      );

      // Keep OpenAI for backward compatibility (can be removed later)
      messageAnalysis = await openaiService.analyzeMessage(latestUserMessage.content);
    }

    // Calculate engagement metrics
    const engagementMetrics = this.calculateEngagementMetrics(userMessages, systemMessages);
    
    // Calculate qualification metrics
    const qualificationMetrics = this.calculateQualificationMetrics(userMessages, messageAnalysis);
    
    // Calculate technical metrics
    const technicalMetrics = this.calculateTechnicalMetrics(userMessages, messageAnalysis);
    
    // Calculate emotional metrics
    const emotionalMetrics = this.calculateEmotionalMetrics(userMessages, messageAnalysis);
    
    // Calculate cultural metrics
    const culturalMetrics = this.calculateCulturalMetrics(userMessages, messageAnalysis);

    // Calculate SMB-specific metrics using Grok analysis
    const smbMetrics = this.calculateSMBMetrics(userMessages, grokAnalysis);

    // Calculate meta metrics
    const metaMetrics = this.calculateMetaMetrics(
      messageCount,
      engagementMetrics,
      qualificationMetrics,
      technicalMetrics,
      emotionalMetrics,
      culturalMetrics,
      previousMetrics
    );

    const metrics: InsertConversationMetrics = {
      conversationId,
      messageCount,
      version: "1.0.0",
      
      // Engagement
      engagementScore: this.calculateDimensionScore([
        engagementMetrics.velocity,
        engagementMetrics.depth,
        engagementMetrics.consistency,
        engagementMetrics.turnTakingBalance,
        1 - engagementMetrics.dropOffRisk // Invert drop-off risk
      ]),
      engagementConfidence: this.calculateConfidence(engagementMetrics, messageCount),
      responseVelocity: engagementMetrics.velocity,
      messageDepthRatio: engagementMetrics.depth,
      questionRatio: engagementMetrics.questionRatio,
      turnTakingBalance: engagementMetrics.turnTakingBalance,
      dropOffRisk: engagementMetrics.dropOffRisk,
      
      // Qualification
      qualificationScore: this.calculateDimensionScore([
        qualificationMetrics.budget,
        qualificationMetrics.authority,
        qualificationMetrics.need,
        qualificationMetrics.timeline
      ]),
      qualificationConfidence: this.calculateConfidence(qualificationMetrics, messageCount),
      budgetSignalStrength: qualificationMetrics.budget,
      budgetRangeMin: qualificationMetrics.budgetRangeMin,
      budgetRangeMax: qualificationMetrics.budgetRangeMax,
      budgetConfidenceLevel: qualificationMetrics.budgetConfidenceLevel,
      authorityScore: qualificationMetrics.authority,
      authorityCertainty: qualificationMetrics.authorityCertainty,
      needIntensity: qualificationMetrics.need,
      timelineUrgency: qualificationMetrics.timeline,
      objectionRisk: qualificationMetrics.objectionRisk,
      
      // Technical
      technicalScore: this.calculateDimensionScore([
        technicalMetrics.sophistication,
        technicalMetrics.scope,
        technicalMetrics.scopeClarity,
        technicalMetrics.maturity,
        1 - technicalMetrics.feasibilityBlockers // Invert blockers
      ]),
      technicalConfidence: this.calculateConfidence(technicalMetrics, messageCount),
      sophisticationLevel: technicalMetrics.sophistication,
      projectScope: technicalMetrics.scope,
      scopeClarity: technicalMetrics.scopeClarity,
      organizationalMaturity: technicalMetrics.maturity,
      feasibilityBlockers: technicalMetrics.feasibilityBlockers,
      
      // Emotional
      emotionalScore: this.calculateDimensionScore([
        emotionalMetrics.trust,
        1 - emotionalMetrics.frustration, // Invert frustration
        emotionalMetrics.enthusiasm
      ]),
      emotionalConfidence: this.calculateConfidence(emotionalMetrics, messageCount),
      trustLevel: emotionalMetrics.trust,
      frustrationLevel: emotionalMetrics.frustration,
      enthusiasmLevel: emotionalMetrics.enthusiasm,
      objectionTone: emotionalMetrics.objectionTone,
      
      // Cultural
      culturalScore: this.calculateDimensionScore([
        culturalMetrics.appropriateness,
        culturalMetrics.adaptation
      ]),
      culturalConfidence: this.calculateConfidence(culturalMetrics, messageCount),
      formalityIndex: culturalMetrics.formality,
      communicationStyle: culturalMetrics.style,
      businessCulture: culturalMetrics.culture,
      
      // Meta
      conversationHealthScore: metaMetrics.health,
      flowScore: metaMetrics.flow,
      coverageRatio: metaMetrics.coverage,
      efficiencyScore: metaMetrics.efficiency,
      systemConfidenceScore: metaMetrics.systemConfidence,
      explorationRate: metaMetrics.explorationRate,
      adaptationsMade: metaMetrics.adaptations,
      
      // Full data
      fullMetrics: {
        engagement: engagementMetrics,
        qualification: qualificationMetrics,
        technical: technicalMetrics,
        emotional: emotionalMetrics,
        cultural: culturalMetrics,
        meta: metaMetrics,
        messageAnalysis,
        smb: smbMetrics,
        grokAnalysis
      }
    };

    const explanations = await this.generateExplanations(metrics, smbMetrics);
    const confidences = this.calculateConfidences(metrics, messageCount);

    return {
      metrics,
      explanations,
      confidences,
      grokAnalysis: grokAnalysis || undefined
    };
  }

  private calculateEngagementMetrics(userMessages: Message[], systemMessages: Message[]) {
    if (userMessages.length === 0) {
      return { velocity: 0, depth: 0, consistency: 0, questionRatio: 0, turnTakingBalance: 0, dropOffRisk: 0 };
    }

    // Response velocity (based on time between system message and user response)
    let totalResponseTime = 0;
    let responseCount = 0;
    
    for (let i = 1; i < userMessages.length; i++) {
      const prevSystemMsg = systemMessages.find(m => 
        m.timestamp && userMessages[i].timestamp && 
        m.timestamp < userMessages[i].timestamp && 
        m.timestamp > (userMessages[i-1]?.timestamp || new Date(0))
      );
      
      if (prevSystemMsg && prevSystemMsg.timestamp && userMessages[i].timestamp) {
        const responseTime = (userMessages[i].timestamp.getTime() - prevSystemMsg.timestamp.getTime()) / 1000;
        totalResponseTime += responseTime;
        responseCount++;
      }
    }
    
    const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : this.baselineResponseTime;
    const velocity = Math.min(1, this.baselineResponseTime / avgResponseTime);

    // Message depth (average words per message)
    const totalWords = userMessages.reduce((sum, msg) => sum + msg.content.split(' ').length, 0);
    const avgWords = totalWords / userMessages.length;
    const depth = Math.min(1, avgWords / this.baselineWords);

    // Response consistency (standard deviation of response times)
    const consistency = responseCount > 1 ? Math.max(0, 1 - (this.calculateStdDev(
      userMessages.slice(1).map((msg, i) => {
        const prevMsg = systemMessages.find(m => 
          m.timestamp && msg.timestamp && 
          m.timestamp < msg.timestamp && 
          m.timestamp > (userMessages[i]?.timestamp || new Date(0))
        );
        return prevMsg && prevMsg.timestamp && msg.timestamp ? (msg.timestamp.getTime() - prevMsg.timestamp.getTime()) / 1000 : 0;
      })
    ) / this.baselineResponseTime)) : 0.5;

    // Question ratio (user questions / total user messages)
    const questionCount = userMessages.filter(msg => 
      msg.content.includes('?') || 
      msg.content.toLowerCase().includes('cómo') ||
      msg.content.toLowerCase().includes('cuándo') ||
      msg.content.toLowerCase().includes('dónde') ||
      msg.content.toLowerCase().includes('qué') ||
      msg.content.toLowerCase().includes('por qué')
    ).length;
    
    const questionRatio = questionCount / userMessages.length;

    // Turn-taking balance (measures balanced conversation flow)
    const allMessages = [...userMessages, ...systemMessages].sort((a, b) => 
      (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
    );
    
    let userTurns = 0;
    let systemTurns = 0;
    let currentSpeaker = '';
    
    allMessages.forEach(msg => {
      if (msg.direction !== currentSpeaker) {
        if (msg.direction === 'incoming') userTurns++;
        else systemTurns++;
        currentSpeaker = msg.direction;
      }
    });
    
    const totalTurns = userTurns + systemTurns;
    const idealBalance = 0.5; // Perfect 50/50 balance
    const actualBalance = totalTurns > 0 ? userTurns / totalTurns : 0.5;
    const turnTakingBalance = 1 - Math.abs(actualBalance - idealBalance) * 2; // Convert to 0-1 scale

    // Drop-off risk (measures conversation dropout risk)
    let dropOffRisk = 0;
    
    if (userMessages.length >= 3) {
      // Check recent response time trends
      const recentResponses = userMessages.slice(-3).map((msg, i) => {
        const prevSystemMsg = systemMessages.find(m => 
          m.timestamp && msg.timestamp && 
          m.timestamp < msg.timestamp && 
          (i === 0 || m.timestamp > userMessages[userMessages.length - 3 + i - 1].timestamp!)
        );
        return prevSystemMsg && prevSystemMsg.timestamp && msg.timestamp ? 
          (msg.timestamp.getTime() - prevSystemMsg.timestamp.getTime()) / 1000 : this.baselineResponseTime;
      });
      
      // Increasing response times indicate potential drop-off
      const timeIncreases = recentResponses.filter((time, i) => 
        i > 0 && time > recentResponses[i - 1] * 1.5
      ).length;
      
      // Check for declining message quality
      const recentWordCounts = userMessages.slice(-3).map(msg => msg.content.split(' ').length);
      const wordDeclines = recentWordCounts.filter((count, i) => 
        i > 0 && count < recentWordCounts[i - 1] * 0.7
      ).length;
      
      // Check for negative sentiment indicators
      const negativePhrases = [
        'no estoy', 'no tengo', 'muy caro', 'demasiado', 'imposible', 
        'no puedo', 'quizás después', 'lo pensaré'
      ];
      const recentNegativeSignals = userMessages.slice(-2).filter(msg =>
        negativePhrases.some(phrase => msg.content.toLowerCase().includes(phrase))
      ).length;
      
      // Calculate composite drop-off risk
      dropOffRisk = Math.min(1, 
        (timeIncreases / 2) * 0.4 + 
        (wordDeclines / 2) * 0.3 + 
        (recentNegativeSignals / 2) * 0.3
      );
    }

    return {
      velocity: Math.max(0, Math.min(1, velocity)),
      depth: Math.max(0, Math.min(1, depth)),
      consistency: Math.max(0, Math.min(1, consistency)),
      questionRatio: Math.max(0, Math.min(1, questionRatio)),
      turnTakingBalance: Math.max(0, Math.min(1, turnTakingBalance)),
      dropOffRisk: Math.max(0, Math.min(1, dropOffRisk))
    };
  }

  private calculateQualificationMetrics(userMessages: Message[], messageAnalysis: any) {
    if (userMessages.length === 0) {
      return { 
        budget: 0, authority: 0, need: 0, timeline: 0, 
        budgetRangeMin: 0, budgetRangeMax: 0, budgetConfidenceLevel: 0,
        authorityCertainty: 0, objectionRisk: 0
      };
    }

    // Budget signals
    const budgetKeywords = [
      'presupuesto', 'precio', 'coste', 'costo', 'inversión', 'euros', 'dinero',
      'económico', 'financiero', 'pago', 'facturación'
    ];
    
    let budgetMentions = 0;
    userMessages.forEach(msg => {
      budgetKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          budgetMentions++;
        }
      });
    });
    
    const budget = Math.min(1, budgetMentions / userMessages.length + 
      (messageAnalysis?.budgetSignals?.length || 0) * 0.1);

    // Advanced budget range analysis for ~$10,000 deals
    let budgetRangeMin = 0;
    let budgetRangeMax = 0;
    let budgetConfidenceLevel = 0;

    const allMessageText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    
    // High-ticket consulting range indicators (~$10,000)
    const budgetRangePatterns = [
      { pattern: /(\d+)[\s]*mil[\s]*(euros?|dólares?|usd)/g, multiplier: 1000 },
      { pattern: /(\d+)[\s]*k[\s]*(euros?|dólares?|usd)/g, multiplier: 1000 },
      { pattern: /(\d+)[\.,](\d{3})[\s]*(euros?|dólares?|usd)/g, multiplier: 1 },
      { pattern: /entre[\s]*(\d+)[\s]*y[\s]*(\d+)[\s]*mil/g, multiplier: 1000 },
      { pattern: /presupuesto[\s]*de[\s]*(\d+)[\s]*mil/g, multiplier: 1000 },
      { pattern: /inversión[\s]*de[\s]*(\d+)[\s]*mil/g, multiplier: 1000 }
    ];

    budgetRangePatterns.forEach(({ pattern, multiplier }) => {
      const matches = Array.from(allMessageText.matchAll(pattern));
      matches.forEach(match => {
        if (match[1]) {
          const amount = parseInt(match[1]) * multiplier;
          if (amount >= 5000 && amount <= 50000) { // Focus on consulting range
            if (budgetRangeMin === 0 || amount < budgetRangeMin) budgetRangeMin = amount;
            if (amount > budgetRangeMax) budgetRangeMax = amount;
            budgetConfidenceLevel = Math.min(1, budgetConfidenceLevel + 0.3);
          }
        }
        if (match[2]) { // Range patterns
          const amount2 = parseInt(match[2]) * multiplier;
          if (amount2 >= 5000 && amount2 <= 50000) {
            budgetRangeMax = Math.max(budgetRangeMax, amount2);
            budgetConfidenceLevel = Math.min(1, budgetConfidenceLevel + 0.4);
          }
        }
      });
    });

    // High-value indicators without specific amounts
    const highValueIndicators = [
      'consultoría estratégica', 'transformación digital', 'proyecto integral',
      'consultoría premium', 'asesoramiento estratégico', 'consultoría especializada'
    ];
    
    const highValueMentions = highValueIndicators.filter(indicator => 
      allMessageText.includes(indicator)
    ).length;

    if (highValueMentions > 0 && budgetRangeMin === 0) {
      budgetRangeMin = 8000;  // Typical high-ticket consulting floor
      budgetRangeMax = 15000; // Typical high-ticket consulting ceiling
      budgetConfidenceLevel = 0.6;
    }

    // Authority signals
    const authorityKeywords = [
      'decidimos', 'equipo', 'jefe', 'director', 'gerente', 'nosotros',
      'empresa', 'organización', 'departamento'
    ];
    
    let authorityMentions = 0;
    userMessages.forEach(msg => {
      authorityKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          authorityMentions++;
        }
      });
    });
    
    const authority = Math.min(1, authorityMentions / userMessages.length + 
      (messageAnalysis?.authoritySignals?.length || 0) * 0.1);

    // Advanced authority certainty analysis
    let authorityCertainty = authority;
    
    // High-certainty authority indicators
    const highAuthorityPhrases = [
      'soy el', 'soy la', 'tomo las decisiones', 'mi decisión', 'yo decido',
      'director general', 'ceo', 'gerente general', 'propietario', 'dueño'
    ];
    
    const mediumAuthorityPhrases = [
      'mi equipo', 'nosotros decidimos', 'consultaré con', 'tendré que verificar',
      'director de', 'gerente de', 'coordinador', 'responsable de'
    ];
    
    const lowAuthorityPhrases = [
      'tendré que preguntar', 'no soy quien decide', 'mi jefe', 'supervisar',
      'consultaré', 'verificar', 'analista', 'asistente'
    ];

    highAuthorityPhrases.forEach(phrase => {
      if (allMessageText.includes(phrase)) authorityCertainty = Math.min(1, authorityCertainty + 0.3);
    });
    
    mediumAuthorityPhrases.forEach(phrase => {
      if (allMessageText.includes(phrase)) authorityCertainty = Math.min(1, authorityCertainty + 0.1);
    });
    
    lowAuthorityPhrases.forEach(phrase => {
      if (allMessageText.includes(phrase)) authorityCertainty = Math.max(0, authorityCertainty - 0.2);
    });

    // Objection risk assessment
    let objectionRisk = 0;
    
    const objectionIndicators = [
      // Price objections
      'muy caro', 'demasiado costoso', 'fuera de presupuesto', 'no tenemos fondos',
      // Time objections  
      'no tenemos tiempo', 'muy ocupados', 'quizás más adelante', 'tal vez después',
      // Authority objections
      'tendré que consultar', 'no puedo decidir solo', 'necesito aprobación',
      // Need objections
      'no estamos seguros', 'no es prioritario', 'lo pensaremos', 'no urgente',
      // Competitor objections
      'ya tenemos', 'trabajamos con otros', 'otra empresa', 'proveedor actual',
      // Trust objections
      'no conocemos', 'referencias', 'garantías', 'experiencia previa'
    ];

    const recentMessages = userMessages.slice(-3); // Focus on recent objections
    objectionIndicators.forEach(indicator => {
      recentMessages.forEach(msg => {
        if (msg.content.toLowerCase().includes(indicator)) {
          objectionRisk = Math.min(1, objectionRisk + 0.2);
        }
      });
    });

    // Add objection tone from enhanced analysis
    if (messageAnalysis?.objectionTone) {
      objectionRisk = Math.min(1, objectionRisk + messageAnalysis.objectionTone * 0.4);
    }

    // Need intensity
    const needKeywords = [
      'problema', 'necesidad', 'desafío', 'dificultad', 'urgente',
      'importante', 'crítico', 'solución', 'ayuda'
    ];
    
    let needMentions = 0;
    userMessages.forEach(msg => {
      needKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          needMentions++;
        }
      });
    });
    
    const need = Math.min(1, needMentions / userMessages.length + 
      (messageAnalysis?.needSignals?.length || 0) * 0.1 +
      (messageAnalysis?.urgencyLevel || 0) * 0.3);

    // Timeline urgency
    const timelineKeywords = [
      'pronto', 'rápido', 'urgente', 'inmediato', 'ya', 'ahora',
      'semana', 'mes', 'trimestre'
    ];
    
    let timelineMentions = 0;
    userMessages.forEach(msg => {
      timelineKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          timelineMentions++;
        }
      });
    });
    
    const timeline = Math.min(1, timelineMentions / userMessages.length + 
      (messageAnalysis?.urgencyLevel || 0) * 0.5);

    return {
      budget: Math.max(0, Math.min(1, budget)),
      authority: Math.max(0, Math.min(1, authority)),
      need: Math.max(0, Math.min(1, need)),
      timeline: Math.max(0, Math.min(1, timeline)),
      budgetRangeMin: budgetRangeMin,
      budgetRangeMax: budgetRangeMax,
      budgetConfidenceLevel: Math.max(0, Math.min(1, budgetConfidenceLevel)),
      authorityCertainty: Math.max(0, Math.min(1, authorityCertainty)),
      objectionRisk: Math.max(0, Math.min(1, objectionRisk))
    };
  }

  private calculateTechnicalMetrics(userMessages: Message[], messageAnalysis: any) {
    if (userMessages.length === 0) {
      return { sophistication: 0, scope: 0, scopeClarity: 0, maturity: 0, feasibilityBlockers: 0 };
    }

    // Technical sophistication
    const techKeywords = [
      'api', 'base de datos', 'servidor', 'cloud', 'software', 'sistema',
      'integración', 'automatización', 'digital', 'tecnología', 'plataforma',
      'desarrollo', 'programación', 'infraestructura'
    ];
    
    let techMentions = 0;
    userMessages.forEach(msg => {
      techKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          techMentions++;
        }
      });
    });
    
    const sophistication = Math.min(1, techMentions / userMessages.length + 
      (messageAnalysis?.technicalLevel || 0) * 0.5);

    // Project scope indicators
    const scopeKeywords = [
      'usuarios', 'empleados', 'sucursales', 'departamentos', 'millones',
      'miles', 'grande', 'pequeño', 'mediano', 'escala', 'volumen'
    ];
    
    let scopeMentions = 0;
    userMessages.forEach(msg => {
      scopeKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          scopeMentions++;
        }
      });
    });
    
    const scope = Math.min(1, scopeMentions / userMessages.length * 2);

    // Scope clarity assessment
    const allMessageText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    let scopeClarity = 0;
    
    // Clear scope indicators
    const clarityIndicators = [
      'necesitamos exactamente', 'específicamente', 'concretamente', 'el objetivo es',
      'queremos lograr', 'el resultado esperado', 'fase uno', 'etapa inicial',
      'prioridad', 'entregables', 'alcance del proyecto', 'límites del proyecto'
    ];
    
    // Vague scope indicators (reduce clarity)
    const vagueIndicators = [
      'algo así como', 'más o menos', 'quizás', 'tal vez', 'no estamos seguros',
      'dependiendo', 'a ver qué sale', 'exploratorio', 'veremos'
    ];
    
    clarityIndicators.forEach(indicator => {
      if (allMessageText.includes(indicator)) scopeClarity += 0.2;
    });
    
    vagueIndicators.forEach(indicator => {
      if (allMessageText.includes(indicator)) scopeClarity -= 0.15;
    });
    
    // Detailed requirements boost clarity
    const requirementPatterns = [
      /\d+\s+(usuarios?|empleados?|sucursales?)/, // Specific numbers
      /en\s+\d+\s+(semanas?|meses?|días?)/, // Specific timelines
      /integrar\s+con\s+\w+/, // Specific integrations
      /compatibilidad\s+con\s+\w+/ // Specific compatibility
    ];
    
    requirementPatterns.forEach(pattern => {
      if (pattern.test(allMessageText)) scopeClarity += 0.1;
    });
    
    scopeClarity = Math.max(0, Math.min(1, scopeClarity));

    // Feasibility blockers assessment
    let feasibilityBlockers = 0;
    
    const blockerIndicators = [
      // Technical blockers
      'legacy system', 'sistema antiguo', 'tecnología obsoleta', 'limitaciones técnicas',
      'no es compatible', 'restricciones de seguridad', 'firewall', 'política de TI',
      // Budget blockers  
      'presupuesto limitado', 'fondos insuficientes', 'restricciones financieras',
      'corte de gastos', 'crisis económica', 'reducción de costos',
      // Time blockers
      'tiempo limitado', 'fecha límite', 'urgencia extrema', 'recursos ocupados',
      'personal no disponible', 'vacaciones', 'otros proyectos prioritarios',
      // Organizational blockers
      'resistencia al cambio', 'cultura conservadora', 'burocracia', 'aprobaciones',
      'compliance', 'regulaciones', 'auditoria pendiente', 'proceso de aprobación'
    ];
    
    blockerIndicators.forEach(blocker => {
      if (allMessageText.includes(blocker)) feasibilityBlockers += 0.15;
    });
    
    // High complexity signals that might indicate blockers
    const complexitySignals = [
      'muy complejo', 'demasiado complicado', 'nunca hemos hecho', 'primera vez',
      'no tenemos experiencia', 'capacitación necesaria', 'curva de aprendizaje'
    ];
    
    complexitySignals.forEach(signal => {
      if (allMessageText.includes(signal)) feasibilityBlockers += 0.1;
    });
    
    feasibilityBlockers = Math.max(0, Math.min(1, feasibilityBlockers));

    // Organizational maturity
    const maturityKeywords = [
      'proceso', 'procedimiento', 'metodología', 'estándar', 'política',
      'governance', 'cumplimiento', 'auditoría', 'certificación'
    ];
    
    let maturityMentions = 0;
    userMessages.forEach(msg => {
      maturityKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          maturityMentions++;
        }
      });
    });
    
    const maturity = Math.min(1, maturityMentions / userMessages.length * 2);

    return {
      sophistication: Math.max(0, Math.min(1, sophistication)),
      scope: Math.max(0, Math.min(1, scope)),
      scopeClarity: Math.max(0, Math.min(1, scopeClarity)),
      maturity: Math.max(0, Math.min(1, maturity)),
      feasibilityBlockers: Math.max(0, Math.min(1, feasibilityBlockers))
    };
  }

  private calculateEmotionalMetrics(userMessages: Message[], messageAnalysis: any) {
    if (userMessages.length === 0) {
      return { trust: 0, frustration: 0, enthusiasm: 0, objectionTone: 0 };
    }

    // Trust indicators
    const trustKeywords = [
      'confianza', 'seguro', 'profesional', 'experiencia', 'referencia',
      'recomendación', 'garantía', 'transparente'
    ];
    
    let trustMentions = 0;
    userMessages.forEach(msg => {
      trustKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          trustMentions++;
        }
      });
    });
    
    const trust = Math.min(1, trustMentions / userMessages.length + 
      Math.max(0, messageAnalysis?.sentiment || 0) * 0.3);

    // Frustration indicators
    const frustrationKeywords = [
      'no entiendo', 'confuso', 'problema', 'difícil', 'complicado',
      'no funciona', 'frustrante', 'malo'
    ];
    
    let frustrationMentions = 0;
    userMessages.forEach(msg => {
      frustrationKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          frustrationMentions++;
        }
      });
    });
    
    const frustration = Math.min(1, frustrationMentions / userMessages.length + 
      Math.max(0, -(messageAnalysis?.sentiment || 0)) * 0.3);

    // Enthusiasm indicators
    const enthusiasmKeywords = [
      'excelente', 'perfecto', 'genial', 'fantástico', 'interesante',
      'emocionante', 'increíble', 'magnífico'
    ];
    
    let enthusiasmMentions = 0;
    userMessages.forEach(msg => {
      enthusiasmKeywords.forEach(keyword => {
        if (msg.content.toLowerCase().includes(keyword)) {
          enthusiasmMentions++;
        }
      });
    });
    
    const enthusiasm = Math.min(1, enthusiasmMentions / userMessages.length + 
      Math.max(0, messageAnalysis?.sentiment || 0) * 0.4);

    // Objection tone detection (sophisticated analysis)
    let objectionTone = 0;
    
    // Direct objection tone from enhanced analysis
    if (messageAnalysis?.objectionTone) {
      objectionTone = messageAnalysis.objectionTone;
    }
    
    // Additional objection tone indicators
    const objectionTonePatterns = [
      'pero', 'sin embargo', 'aunque', 'no estoy convencido', 'tengo dudas',
      'me preocupa', 'no estoy seguro', 'suena bien pero', 'el problema es',
      'necesito pensar', 'demasiado', 'muy costoso', 'no creo que'
    ];
    
    const allText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    objectionTonePatterns.forEach(pattern => {
      if (allText.includes(pattern)) objectionTone = Math.min(1, objectionTone + 0.1);
    });
    
    // Questioning patterns that suggest objections
    const questioningPatterns = [
      /¿(realmente|verdaderamente|de verdad)\s+\w+/g,
      /¿no\s+sería\s+mejor/g,
      /¿qué\s+pasa\s+si/g,
      /¿y\s+si\s+no/g
    ];
    
    questioningPatterns.forEach(pattern => {
      if (pattern.test(allText)) objectionTone = Math.min(1, objectionTone + 0.05);
    });

    return {
      trust: Math.max(0, Math.min(1, trust)),
      frustration: Math.max(0, Math.min(1, frustration)),
      enthusiasm: Math.max(0, Math.min(1, enthusiasm)),
      objectionTone: Math.max(0, Math.min(1, objectionTone))
    };
  }

  private calculateCulturalMetrics(userMessages: Message[], messageAnalysis: any) {
    if (userMessages.length === 0) {
      return { formality: 0.5, style: 'formal', culture: 'es', appropriateness: 0.5, adaptation: 0.5 };
    }

    // Formality index
    const formalIndicators = ['usted', 'señor', 'señora', 'disculpe', 'le agradezco'];
    const informalIndicators = ['tú', 'tu', 'gracias', 'vale', 'ok'];

    let formalCount = 0;
    let informalCount = 0;

    userMessages.forEach(msg => {
      formalIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) formalCount++;
      });
      informalIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) informalCount++;
      });
    });

    const totalIndicators = formalCount + informalCount;
    const formality = totalIndicators > 0 ? formalCount / totalIndicators : 0.5;

    // Communication style
    const directnessIndicators = ['necesito', 'quiero', 'no me gusta', 'directamente'];
    const indirectnessIndicators = ['quizás', 'tal vez', 'podría ser', 'me gustaría'];

    let directCount = 0;
    let indirectCount = 0;

    userMessages.forEach(msg => {
      directnessIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) directCount++;
      });
      indirectnessIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) indirectCount++;
      });
    });

    const style = directCount > indirectCount ? 'direct' : 'indirect';

    // Regional culture detection (basic)
    const spainIndicators = ['vale', 'tío', 'guay', 'joder'];
    const latamIndicators = ['wey', 'che', 'pana', 'bacano'];

    let spainCount = 0;
    let latamCount = 0;

    userMessages.forEach(msg => {
      spainIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) spainCount++;
      });
      latamIndicators.forEach(indicator => {
        if (msg.content.toLowerCase().includes(indicator)) latamCount++;
      });
    });

    const culture = spainCount > latamCount ? 'ES' : 'LATAM';

    return {
      formality: Math.max(0, Math.min(1, formality)),
      style,
      culture,
      appropriateness: 0.7, // Would need more sophisticated analysis
      adaptation: 0.6       // Would need historical comparison
    };
  }

  /**
   * Calculate SMB-specific consulting metrics using Grok NLP analysis
   */
  private calculateSMBMetrics(userMessages: Message[], grokAnalysis: MessageAnalysis | null): SMBMetrics {
    if (!grokAnalysis || userMessages.length === 0) {
      return {
        budgetQualification: 0,
        spocAvailability: 0,
        digitalMaturity: 0,
        smbFitScore: 0,
        budgetConfidence: 0,
        spocConfidence: 0,
        maturityConfidence: 0
      };
    }

    // Budget Qualification (minimum 5,000€)
    const budgetSignals = grokAnalysis.budgetSignals;
    let budgetQualification = 0;

    if (budgetSignals.hasExplicitBudget && budgetSignals.meetsMinimum) {
      budgetQualification = 0.9; // Very high confidence
    } else if (budgetSignals.meetsMinimum) {
      budgetQualification = 0.7; // Implicit signals suggest minimum met
    } else if (budgetSignals.hasExplicitBudget && !budgetSignals.meetsMinimum) {
      budgetQualification = 0.2; // Explicitly too low
    } else if (budgetSignals.budgetIndicators.length > 0) {
      budgetQualification = 0.4; // Some budget discussion but unclear
    }

    // Apply Grok confidence
    budgetQualification *= budgetSignals.confidence;

    // SPOC Availability (minimum 4 hours/week)
    const spocSignals = grokAnalysis.spocAvailability;
    let spocAvailability = 0;

    if (spocSignals.hasDesignatedContact && spocSignals.meetsMinimum) {
      spocAvailability = 0.9; // Explicit SPOC with sufficient time
    } else if (spocSignals.meetsMinimum) {
      spocAvailability = 0.7; // Time commitment confirmed
    } else if (spocSignals.hasDesignatedContact) {
      spocAvailability = 0.5; // SPOC exists but time unclear
    } else if (spocSignals.availabilityIndicators.length > 0) {
      spocAvailability = 0.4; // Some availability signals
    }

    // Apply Grok confidence
    spocAvailability *= spocSignals.confidence;

    // Digital Maturity (medium level required)
    const maturitySignals = grokAnalysis.digitalMaturity;
    let digitalMaturity = 0;

    // Base score from maturity level
    if (maturitySignals.maturityLevel === 'high') {
      digitalMaturity = 0.85;
    } else if (maturitySignals.maturityLevel === 'medium') {
      digitalMaturity = 0.65; // Ideal target
    } else if (maturitySignals.maturityLevel === 'low') {
      digitalMaturity = 0.3;
    }

    // Boost for specific indicators
    if (maturitySignals.hasCurrentTools) digitalMaturity += 0.1;
    if (maturitySignals.hasProcesses) digitalMaturity += 0.05;
    if (maturitySignals.hasTechnicalTeam) digitalMaturity += 0.05;

    // Cap at 1.0
    digitalMaturity = Math.min(1, digitalMaturity);

    // Apply Grok confidence
    digitalMaturity *= maturitySignals.confidence;

    // SMB Fit Score (composite)
    // All three must be reasonably strong for good fit
    const smbFitScore = (
      budgetQualification * 0.4 +
      spocAvailability * 0.3 +
      digitalMaturity * 0.3
    );

    return {
      budgetQualification: Math.max(0, Math.min(1, budgetQualification)),
      spocAvailability: Math.max(0, Math.min(1, spocAvailability)),
      digitalMaturity: Math.max(0, Math.min(1, digitalMaturity)),
      smbFitScore: Math.max(0, Math.min(1, smbFitScore)),
      budgetConfidence: budgetSignals.confidence,
      spocConfidence: spocSignals.confidence,
      maturityConfidence: maturitySignals.confidence
    };
  }

  private calculateMetaMetrics(
    messageCount: number,
    engagement: any,
    qualification: any,
    technical: any,
    emotional: any,
    cultural: any,
    previousMetrics?: ConversationMetrics
  ) {
    // Conversation health (overall flow and quality)
    const health = this.calculateDimensionScore([
      engagement.velocity,
      engagement.consistency,
      1 - emotional.frustration,
      cultural.appropriateness
    ]);

    // Information flow quality
    const flow = this.calculateDimensionScore([
      engagement.questionRatio,
      technical.sophistication > 0 ? 1 : 0.5,
      qualification.need > 0 ? 1 : 0.5
    ]);

    // Coverage ratio (how many dimensions have been explored)
    const exploredDimensions = [
      qualification.budget > 0.1,
      qualification.authority > 0.1,
      qualification.need > 0.1,
      technical.sophistication > 0.1,
      emotional.trust > 0.1
    ].filter(Boolean).length;
    
    const coverage = exploredDimensions / 5;

    // Efficiency (information gain per message)
    const efficiency = messageCount > 0 ? Math.min(1, coverage / (messageCount / 10)) : 0;

    // System confidence (how reliable our measurements are)
    const systemConfidence = this.calculateDimensionScore([
      messageCount > 3 ? 1 : messageCount / 3,
      engagement.velocity > 0.1 ? 1 : 0.5,
      Math.min(1, messageCount / 20) // More messages = higher confidence
    ]);

    // Exploration rate (decreases over time)
    const baseExploration = 0.3;
    const explorationRate = baseExploration * (1 / (1 + messageCount * 0.05));

    // Adaptations made (based on previous metrics)
    let adaptations = 0;
    if (previousMetrics) {
      // Count significant changes in scores
      const changes = [
        Math.abs(engagement.velocity - (previousMetrics.responseVelocity || 0)),
        Math.abs(qualification.budget - (previousMetrics.budgetSignalStrength || 0)),
        Math.abs(emotional.trust - (previousMetrics.trustLevel || 0))
      ];
      adaptations = changes.filter(change => change > 0.1).length;
    }

    return {
      health: Math.max(0, Math.min(1, health)),
      flow: Math.max(0, Math.min(1, flow)),
      coverage: Math.max(0, Math.min(1, coverage)),
      efficiency: Math.max(0, Math.min(1, efficiency)),
      systemConfidence: Math.max(0, Math.min(1, systemConfidence)),
      explorationRate: Math.max(0, Math.min(0.5, explorationRate)),
      adaptations
    };
  }

  private calculateDimensionScore(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.max(0, Math.min(1, sum / values.length));
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private async generateExplanations(
    metrics: InsertConversationMetrics,
    smbMetrics: SMBMetrics
  ): Promise<Record<string, string>> {
    return {
      engagement: `Engagement score: ${metrics.engagementScore?.toFixed(2)} - Based on response velocity (${metrics.responseVelocity?.toFixed(2)}) and message depth`,
      qualification: `Qualification score: ${metrics.qualificationScore?.toFixed(2)} - Budget signals: ${metrics.budgetSignalStrength?.toFixed(2)}, Authority: ${metrics.authorityScore?.toFixed(2)}`,
      technical: `Technical score: ${metrics.technicalScore?.toFixed(2)} - Sophistication level indicates ${metrics.sophisticationLevel && metrics.sophisticationLevel > 0.5 ? 'high' : 'basic'} technical knowledge`,
      emotional: `Emotional score: ${metrics.emotionalScore?.toFixed(2)} - Trust: ${metrics.trustLevel?.toFixed(2)}, Frustration: ${metrics.frustrationLevel?.toFixed(2)}`,
      cultural: `Cultural adaptation: ${metrics.culturalScore?.toFixed(2)} - Formality index: ${metrics.formalityIndex?.toFixed(2)}`,
      smb_budget: `Budget Qualification: ${smbMetrics.budgetQualification.toFixed(2)} - ${smbMetrics.budgetQualification >= 0.7 ? 'Meets 5,000€ minimum' : 'Below minimum or unclear'}`,
      smb_spoc: `SPOC Availability: ${smbMetrics.spocAvailability.toFixed(2)} - ${smbMetrics.spocAvailability >= 0.6 ? 'Sufficient time commitment (≥4hrs/week)' : 'Insufficient or unclear'}`,
      smb_maturity: `Digital Maturity: ${smbMetrics.digitalMaturity.toFixed(2)} - ${smbMetrics.digitalMaturity >= 0.5 ? 'Medium+ maturity (good fit)' : 'Low maturity (poor fit)'}`,
      smb_fit: `SMB Fit Score: ${smbMetrics.smbFitScore.toFixed(2)} - ${smbMetrics.smbFitScore >= 0.7 ? 'HIGH PRIORITY LEAD' : smbMetrics.smbFitScore >= 0.5 ? 'Continue qualifying' : 'Low priority / disqualify'}`
    };
  }

  private calculateConfidences(metrics: InsertConversationMetrics, messageCount: number): Record<string, number> {
    const baseConfidence = Math.min(0.9, messageCount / 10); // Higher confidence with more messages
    
    return {
      engagement: Math.max(0.3, baseConfidence),
      qualification: Math.max(0.2, baseConfidence * 0.8), // Qualification needs more evidence
      technical: Math.max(0.4, baseConfidence * 0.9),
      emotional: Math.max(0.3, baseConfidence * 0.7), // Emotions are harder to measure
      cultural: Math.max(0.5, baseConfidence * 0.6)   // Cultural markers are often present early
    };
  }

  createSituationAwarenessState(
    conversationId: string,
    metrics: ConversationMetrics
  ): SituationAwarenessState {
    return {
      version: metrics.version || "1.0.0",
      conversationId,
      timestamp: new Date().toISOString(),
      messageCount: metrics.messageCount || 0,
      dimensions: {
        engagement: {
          score: metrics.engagementScore || 0,
          confidence: metrics.engagementConfidence || 0,
          groups: {
            response: {
              velocity: metrics.responseVelocity || 0,
              depth_ratio: metrics.messageDepthRatio || 0,
              consistency: 0.8
            },
            interaction: {
              question_ratio: metrics.questionRatio || 0,
              clarification_rate: 0.1
            }
          }
        },
        qualification: {
          score: metrics.qualificationScore || 0,
          confidence: metrics.qualificationConfidence || 0,
          groups: {
            budget: {
              signal_strength: metrics.budgetSignalStrength || 0,
              range_identified: Number((metrics.budgetSignalStrength || 0) > 0.5),
              urgency: metrics.timelineUrgency || 0
            },
            authority: {
              decision_power: metrics.authorityScore || 0,
              stakeholder_count: 1
            },
            need: {
              problem_severity: metrics.needIntensity || 0,
              solution_readiness: Math.min(1, (metrics.technicalScore || 0) * (metrics.needIntensity || 0))
            }
          }
        },
        technical: {
          score: metrics.technicalScore || 0,
          confidence: metrics.technicalConfidence || 0,
          groups: {
            sophistication: {
              literacy_level: metrics.sophisticationLevel || 0,
              stack_complexity: 0.5
            },
            scope: {
              estimated_size: metrics.projectScope || 0,
              integration_needs: 0.3
            }
          }
        },
        emotional: {
          score: metrics.emotionalScore || 0,
          confidence: metrics.emotionalConfidence || 0,
          groups: {
            trust: {
              transparency: metrics.trustLevel || 0,
              openness: (metrics.trustLevel || 0) * 0.9
            },
            enthusiasm: {
              excitement: metrics.enthusiasmLevel || 0,
              vision_alignment: (metrics.enthusiasmLevel || 0) * 0.8
            }
          }
        },
        cultural: {
          score: metrics.culturalScore || 0,
          confidence: metrics.culturalConfidence || 0,
          groups: {
            communication: {
              formality: metrics.formalityIndex || 0.5,
              directness: metrics.communicationStyle === 'direct' ? 0.8 : 0.3
            },
            business: {
              decision_style: 0.6, // Would analyze from authority patterns
              relationship_importance: 0.7 // Spanish/LATAM cultural baseline
            }
          }
        }
      },
      meta: {
        conversationHealth: {
          score: metrics.conversationHealthScore || 0,
          confidence: 0.8,
          groups: {
            flow: {
              score: metrics.flowScore || 0
            },
            coverage: {
              ratio: metrics.coverageRatio || 0
            },
            efficiency: {
              score: metrics.efficiencyScore || 0
            }
          }
        },
        systemConfidence: {
          score: metrics.systemConfidenceScore || 0,
          confidence: 0.9,
          groups: {
            certainty: {
              reliability: (metrics.systemConfidenceScore || 0) * 0.9
            },
            learning: {
              adaptation_rate: metrics.explorationRate || 0.3
            }
          }
        },
        learningState: {
          explorationRate: metrics.explorationRate || 0.3,
          confidenceThreshold: 0.7,
          adaptationsMade: metrics.adaptationsMade || 0
        },
        decisionTrace: [] // Would be populated from decision_traces table
      }
    };
  }

  private calculateConfidence(dimensionMetrics: any, messageCount: number): number {
    // Confidence increases with more data points and consistent patterns
    const baseConfidence = Math.min(0.9, 0.3 + (messageCount * 0.08));
    
    // Boost confidence based on clear signal patterns
    let signalBoost = 0;
    if (dimensionMetrics) {
      const values = Object.values(dimensionMetrics).filter(v => typeof v === 'number') as number[];
      if (values.length > 0) {
        const variance = this.calculateVariance(values);
        // Lower variance = higher confidence
        signalBoost = Math.max(0, 0.2 - variance);
      }
    }
    
    return Math.min(0.95, baseConfidence + signalBoost);
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 1;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return variance;
  }

  private calculateClarificationRate(userMessages: Message[]): number {
    if (userMessages.length === 0) return 0;
    const clarificationWords = ['qué', 'cómo', 'cuándo', 'dónde', 'por qué', 'aclarar', 'explicar'];
    const clarificationCount = userMessages.filter(msg => 
      clarificationWords.some(word => msg.content.toLowerCase().includes(word))
    ).length;
    return Math.min(1, clarificationCount / userMessages.length);
  }

  private extractStakeholderCount(userMessages: Message[]): number {
    const stakeholderIndicators = ['equipo', 'jefe', 'director', 'nosotros', 'departamento', 'comité'];
    const mentionsCount = userMessages.reduce((count, msg) => {
      return count + stakeholderIndicators.filter(indicator => 
        msg.content.toLowerCase().includes(indicator)
      ).length;
    }, 0);
    return Math.max(1, Math.min(5, mentionsCount + 1));
  }

  private analyzeTechComplexity(userMessages: Message[]): number {
    const techTerms = ['sistema', 'plataforma', 'integración', 'api', 'base de datos', 'arquitectura', 'escalable'];
    const advancedTerms = ['microservicios', 'cloud', 'devops', 'kubernetes', 'docker'];
    
    let complexity = 0.3; // Base complexity
    const allText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    
    techTerms.forEach(term => {
      if (allText.includes(term)) complexity += 0.1;
    });
    
    advancedTerms.forEach(term => {
      if (allText.includes(term)) complexity += 0.15;
    });
    
    return Math.min(1, complexity);
  }

  private analyzeIntegrationNeeds(userMessages: Message[]): number {
    const integrationTerms = ['integrar', 'conectar', 'sincronizar', 'api', 'erp', 'crm', 'sistema actual'];
    const allText = userMessages.map(m => m.content.toLowerCase()).join(' ');
    
    let needs = 0.2; // Base integration need
    integrationTerms.forEach(term => {
      if (allText.includes(term)) needs += 0.15;
    });
    
    return Math.min(1, needs);
  }
}

export const metricsService = new MetricsService();
