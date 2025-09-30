// Metric Self-Documentation System
// Every metric must be able to explain itself: what, why, how, when, interpret

export interface InterpretationResult {
  level: 'very-low' | 'low' | 'moderate' | 'good' | 'high' | 'very-high';
  meaning: string;
  recommendation?: string;
}

export interface MetricExplanation {
  what: string;
  why: string;
  how: string;
  when: string;
  range: { min: number; max: number; ideal?: [number, number] };
}

export interface MetricContext {
  value: number;
  previousValue?: number;
  conversationPhase: string;
  messageCount: number;
  timestamp: Date;
}

/**
 * Base class for self-documenting metrics
 * All metrics must extend this to provide automatic documentation
 */
export abstract class SelfDocumentingMetric {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly dimension: string,
    public readonly group: string
  ) {}

  /**
   * What this metric measures
   */
  abstract what(): string;

  /**
   * Why this metric matters for lead qualification
   */
  abstract why(): string;

  /**
   * How this metric is calculated (formula/method)
   */
  abstract how(): string;

  /**
   * When this metric gets updated
   */
  abstract when(): string;

  /**
   * Value range and ideal targets
   */
  abstract range(): { min: number; max: number; ideal?: [number, number] };

  /**
   * Interpret a specific value
   */
  abstract interpret(value: number): InterpretationResult;

  /**
   * Generate human-readable explanation for current context
   */
  explain(context: MetricContext): string {
    const interpretation = this.interpret(context.value);
    const trend = this.describeTrend(context);

    return `${this.name} is currently ${interpretation.level} (${context.value.toFixed(2)}). ${interpretation.meaning}. ${trend}`;
  }

  /**
   * Describe trend if previous value exists
   */
  private describeTrend(context: MetricContext): string {
    if (context.previousValue === undefined) {
      return '';
    }

    const delta = context.value - context.previousValue;
    const percentChange = Math.abs((delta / context.previousValue) * 100);

    if (Math.abs(delta) < 0.05) {
      return 'The value is stable.';
    }

    if (delta > 0) {
      return `This is an increase of ${percentChange.toFixed(1)}% from the previous measurement.`;
    } else {
      return `This is a decrease of ${percentChange.toFixed(1)}% from the previous measurement.`;
    }
  }

  /**
   * Get complete metric documentation
   */
  getDocumentation(): MetricExplanation {
    return {
      what: this.what(),
      why: this.why(),
      how: this.how(),
      when: this.when(),
      range: this.range()
    };
  }

  /**
   * Get JSON representation for API
   */
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      dimension: this.dimension,
      group: this.group,
      documentation: this.getDocumentation()
    };
  }
}

// ============================================================================
// ENGAGEMENT DIMENSION METRICS
// ============================================================================

export class ResponseVelocityMetric extends SelfDocumentingMetric {
  constructor() {
    super('response_velocity', 'Response Velocity', 'engagement', 'response');
  }

  what(): string {
    return 'Measures how quickly the prospect replies relative to expected baseline (5 minutes)';
  }

  why(): string {
    return 'Fast responses indicate high interest and priority. Slow responses suggest lower engagement or competing priorities. This helps identify hot leads vs cold leads.';
  }

  how(): string {
    return 'Formula: 1 / (avg_response_time_seconds / baseline_expected_seconds). Values >1 indicate faster than expected responses.';
  }

  when(): string {
    return 'Updated after each prospect message is received';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 3, ideal: [0.7, 1.5] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 1.5) {
      return {
        level: 'very-high',
        meaning: 'Highly engaged, prospect is prioritizing this conversation',
        recommendation: 'Move quickly to qualification questions while engagement is high'
      };
    }
    if (value > 0.7) {
      return {
        level: 'good',
        meaning: 'Good engagement level, prospect is responsive',
        recommendation: 'Continue with current conversation pace'
      };
    }
    if (value > 0.3) {
      return {
        level: 'moderate',
        meaning: 'Moderate engagement, prospect may have other priorities',
        recommendation: 'Consider shorter, more focused questions'
      };
    }
    return {
      level: 'low',
      meaning: 'Low engagement, prospect may be losing interest',
      recommendation: 'Re-engage with value proposition or consider pausing conversation'
    };
  }
}

export class MessageDepthRatioMetric extends SelfDocumentingMetric {
  constructor() {
    super('message_depth_ratio', 'Message Depth Ratio', 'engagement', 'response');
  }

  what(): string {
    return 'Ratio of actual words per message vs expected baseline (20 words)';
  }

  why(): string {
    return 'Detailed responses indicate thoughtful engagement and willingness to share information. Short responses may indicate disinterest or lack of time.';
  }

  how(): string {
    return 'Formula: avg_words_per_message / baseline_words_expected (20)';
  }

  when(): string {
    return 'Updated after each prospect message';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 5, ideal: [0.8, 2.0] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 2.0) {
      return {
        level: 'very-high',
        meaning: 'Very detailed responses, prospect is highly engaged',
        recommendation: 'Good sign for qualification - prospect is investing effort'
      };
    }
    if (value > 0.8) {
      return {
        level: 'good',
        meaning: 'Adequate detail in responses',
        recommendation: 'Continue with current question complexity'
      };
    }
    if (value > 0.4) {
      return {
        level: 'moderate',
        meaning: 'Brief responses, prospect may be on mobile or busy',
        recommendation: 'Simplify questions, ask yes/no when possible'
      };
    }
    return {
      level: 'low',
      meaning: 'Very brief responses, minimal engagement',
      recommendation: 'Check if timing is good, consider re-engagement strategy'
    };
  }
}

export class BudgetSignalStrengthMetric extends SelfDocumentingMetric {
  constructor() {
    super('budget_signal_strength', 'Budget Signal Strength', 'qualification', 'budget');
  }

  what(): string {
    return 'Strength of budget-related signals in conversation (explicit mentions, price inquiries, ROI discussions)';
  }

  why(): string {
    return 'Budget discussions indicate serious intent and qualification readiness. The stronger the signal, the closer the prospect is to making a decision.';
  }

  how(): string {
    return 'Formula: (explicit_budget_mention × 1.0 + price_inquiry × 0.5 + roi_discussion × 0.3) / message_count';
  }

  when(): string {
    return 'Updated after each message that contains budget-related keywords or entities';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.3, 0.8] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 0.7) {
      return {
        level: 'very-high',
        meaning: 'Strong explicit budget signals, prospect is ready to discuss pricing',
        recommendation: 'Provide pricing information and move to proposal stage'
      };
    }
    if (value > 0.4) {
      return {
        level: 'good',
        meaning: 'Moderate budget signals, prospect is considering investment',
        recommendation: 'Continue qualification, ask about budget range if not explicit'
      };
    }
    if (value > 0.2) {
      return {
        level: 'moderate',
        meaning: 'Weak budget signals, prospect may not be ready to discuss pricing',
        recommendation: 'Focus on value proposition before discussing budget'
      };
    }
    return {
      level: 'low',
      meaning: 'No budget signals detected',
      recommendation: 'Too early for pricing discussion, focus on need identification'
    };
  }
}

export class AuthorityScoreMetric extends SelfDocumentingMetric {
  constructor() {
    super('authority_score', 'Authority Score', 'qualification', 'authority');
  }

  what(): string {
    return 'Assessment of prospect\'s decision-making authority based on language, titles, and team references';
  }

  why(): string {
    return 'Authority determines whether the prospect can make purchasing decisions. High authority leads to faster sales cycles.';
  }

  how(): string {
    return 'Formula: uses_we_language × 0.4 + mentions_team × 0.3 + decision_timeline_mentioned × 0.3 + title_indicators';
  }

  when(): string {
    return 'Updated when prospect reveals information about their role, team, or decision-making process';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.6, 1.0] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 0.8) {
      return {
        level: 'very-high',
        meaning: 'High authority, likely decision maker (CEO, Director, or explicitly stated)',
        recommendation: 'Move quickly to proposal - this person can make decisions'
      };
    }
    if (value > 0.5) {
      return {
        level: 'good',
        meaning: 'Moderate authority, likely influencer or manager with approval process',
        recommendation: 'Qualify decision-making process and stakeholders involved'
      };
    }
    if (value > 0.3) {
      return {
        level: 'moderate',
        meaning: 'Limited authority, may need manager approval',
        recommendation: 'Ask about decision-making process and involve higher authority'
      };
    }
    return {
      level: 'low',
      meaning: 'Low authority, likely information gatherer',
      recommendation: 'Qualify whether they can connect us with decision maker'
    };
  }
}

export class TrustLevelMetric extends SelfDocumentingMetric {
  constructor() {
    super('trust_level', 'Trust Level', 'emotional', 'trust');
  }

  what(): string {
    return 'Measure of trust and openness based on information sharing, candor, and vulnerability';
  }

  why(): string {
    return 'Trust is essential for B2B sales. High trust leads to honest qualification discussions and better partnership potential.';
  }

  how(): string {
    return 'Formula: shares_challenges × 0.4 + asks_for_advice × 0.3 + provides_context × 0.3';
  }

  when(): string {
    return 'Updated when prospect shares problems, asks for recommendations, or provides background context';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.5, 0.9] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 0.7) {
      return {
        level: 'high',
        meaning: 'High trust, prospect is open and sharing detailed information',
        recommendation: 'Good foundation for partnership - continue building relationship'
      };
    }
    if (value > 0.4) {
      return {
        level: 'good',
        meaning: 'Moderate trust, prospect is willing to engage but cautious',
        recommendation: 'Continue demonstrating expertise and value'
      };
    }
    if (value > 0.2) {
      return {
        level: 'moderate',
        meaning: 'Limited trust, prospect is guarded',
        recommendation: 'Focus on credibility building - share case studies, references'
      };
    }
    return {
      level: 'low',
      meaning: 'Low trust, prospect is not sharing information',
      recommendation: 'Re-establish credibility, consider warm introduction if available'
    };
  }
}

export class FormalityIndexMetric extends SelfDocumentingMetric {
  constructor() {
    super('formality_index', 'Formality Index', 'cultural', 'communication-style');
  }

  what(): string {
    return 'Assessment of formality level in Spanish communication (usted vs tú/vos)';
  }

  why(): string {
    return 'Matching formality level is crucial in Spanish B2B culture. Mismatched formality can damage rapport and trust.';
  }

  how(): string {
    return 'Formula: (formal_greetings + title_usage + usted_vs_tu_ratio) / 3';
  }

  when(): string {
    return 'Updated after each message is analyzed for formality markers';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.6, 0.9] };
  }

  interpret(value: number): InterpretationResult {
    if (value > 0.7) {
      return {
        level: 'high',
        meaning: 'Very formal communication (usted, títulos)',
        recommendation: 'Maintain formal tone - likely Spain or senior executive'
      };
    }
    if (value > 0.4) {
      return {
        level: 'moderate',
        meaning: 'Moderately formal communication',
        recommendation: 'Match this formality level in responses'
      };
    }
    if (value > 0.2) {
      return {
        level: 'low',
        meaning: 'Informal communication (tú)',
        recommendation: 'Informal but professional - likely younger professional or startup'
      };
    }
    return {
      level: 'very-low',
      meaning: 'Very informal (vos, che) - likely Argentina/Uruguay',
      recommendation: 'Match regional informal style while maintaining professionalism'
    };
  }
}

// ============================================================================
// SMB CONSULTING-SPECIFIC METRICS
// ============================================================================

export class BudgetQualificationMetric extends SelfDocumentingMetric {
  constructor() {
    super('budget_qualification_smb', 'Budget Qualification (SMB)', 'qualification', 'budget-smb');
  }

  what(): string {
    return 'Assesses whether the prospect meets the minimum budget threshold of 5,000€ for SMB consulting engagements';
  }

  why(): string {
    return 'Budget qualification is critical for SMB consulting to ensure project viability. Projects below 5,000€ typically lack sufficient scope for meaningful consulting impact and profitability.';
  }

  how(): string {
    return 'Uses Grok NLP to detect explicit budget mentions, budget ranges, and implicit budget signals. Formula: (hasExplicitBudget × 0.5 + meetsMinimum × 0.5) × grok_confidence';
  }

  when(): string {
    return 'Updated after each message containing budget-related keywords, price discussions, or investment mentions detected by Grok NLP';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.7, 1.0] };
  }

  interpret(value: number): InterpretationResult {
    if (value >= 0.8) {
      return {
        level: 'very-high',
        meaning: 'Strong budget qualification - explicit mention of ≥5,000€ or equivalent high-value signals',
        recommendation: 'Proceed to proposal stage - budget is qualified and sufficient'
      };
    }
    if (value >= 0.6) {
      return {
        level: 'high',
        meaning: 'Good budget signals - likely meets 5,000€ minimum based on project scope or implicit indicators',
        recommendation: 'Ask for explicit budget confirmation before moving to proposal'
      };
    }
    if (value >= 0.4) {
      return {
        level: 'moderate',
        meaning: 'Moderate budget signals - budget range unclear but project scope suggests potential fit',
        recommendation: 'Probe budget explicitly: "Para proyectos de esta naturaleza, trabajamos con presupuestos desde 5,000€..."'
      };
    }
    if (value >= 0.2) {
      return {
        level: 'low',
        meaning: 'Weak budget signals - may not meet 5,000€ minimum threshold',
        recommendation: 'Qualify budget early to avoid wasted effort: "¿Tienen un presupuesto definido para este proyecto?"'
      };
    }
    return {
      level: 'very-low',
      meaning: 'No budget signals or explicit mentions below 5,000€',
      recommendation: 'Disqualify or educate on value: "Nuestros proyectos de consultoría comienzan desde 5,000€ debido al alcance necesario..."'
    };
  }
}

export class SPOCAvailabilityMetric extends SelfDocumentingMetric {
  constructor() {
    super('spoc_availability', 'SPOC Availability', 'qualification', 'availability');
  }

  what(): string {
    return 'Measures whether the prospect has a designated Single Point of Contact available for ≥4 hours/week';
  }

  why(): string {
    return 'SMB consulting requires a dedicated client contact with minimum 4 hours/week availability for meetings, feedback, and coordination. Without this, projects stall and fail.';
  }

  how(): string {
    return 'Grok NLP analyzes availability mentions, meeting commitment signals, and time allocation indicators. Formula: (hasDesignatedContact × 0.4 + meetsMinimum × 0.6) × grok_confidence';
  }

  when(): string {
    return 'Updated when prospect discusses availability, meeting schedules, time commitments, or team resource allocation';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.6, 1.0] };
  }

  interpret(value: number): InterpretationResult {
    if (value >= 0.8) {
      return {
        level: 'very-high',
        meaning: 'Confirmed SPOC with ≥4 hours/week - explicit commitment to regular meetings and availability',
        recommendation: 'SPOC qualified - schedule kickoff meeting and establish communication cadence'
      };
    }
    if (value >= 0.6) {
      return {
        level: 'high',
        meaning: 'Likely SPOC available - signals suggest sufficient time commitment',
        recommendation: 'Confirm explicitly: "Necesitaremos reuniones semanales de aprox. 2-3 horas, ¿pueden comprometerse?"'
      };
    }
    if (value >= 0.4) {
      return {
        level: 'moderate',
        meaning: 'Moderate availability signals - SPOC designation unclear',
        recommendation: 'Probe availability: "¿Quién sería la persona responsable de coordinar con nosotros semanalmente?"'
      };
    }
    if (value >= 0.2) {
      return {
        level: 'low',
        meaning: 'Weak availability signals - may lack time for proper engagement',
        recommendation: 'Qualify time commitment: "La consultoría requiere mínimo 4 horas semanales de su equipo, ¿es viable?"'
      };
    }
    return {
      level: 'very-low',
      meaning: 'No SPOC or insufficient availability - red flag for project success',
      recommendation: 'Consider disqualifying: "Sin un punto de contacto dedicado, el proyecto tendrá dificultades para avanzar"'
    };
  }
}

export class DigitalMaturityMetric extends SelfDocumentingMetric {
  constructor() {
    super('digital_maturity_smb', 'Digital Maturity (SMB)', 'technical', 'maturity');
  }

  what(): string {
    return 'Assesses organizational digital maturity: current tools, established processes, and technical team capability';
  }

  why(): string {
    return 'Medium digital maturity is required for consulting success. Too low = project becomes training, not consulting. Companies need basic tools/processes to implement recommendations.';
  }

  how(): string {
    return 'Grok NLP evaluates mentions of: (1) Current tools (CRM, ERP, software), (2) Established processes, (3) Technical team. Formula: (hasTools × 0.4 + hasProcesses × 0.3 + hasTechTeam × 0.3)';
  }

  when(): string {
    return 'Updated when prospect mentions current software, operational processes, team structure, or technical capabilities';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.5, 0.8] };
  }

  interpret(value: number): InterpretationResult {
    if (value >= 0.8) {
      return {
        level: 'very-high',
        meaning: 'High digital maturity - sophisticated tools, processes, and technical team in place',
        recommendation: 'Excellent fit - can handle advanced consulting work and rapid implementation'
      };
    }
    if (value >= 0.5) {
      return {
        level: 'high',
        meaning: 'Medium digital maturity - basic tools and processes established, some technical capability',
        recommendation: 'Ideal SMB consulting fit - ready for process improvement and optimization'
      };
    }
    if (value >= 0.3) {
      return {
        level: 'moderate',
        meaning: 'Low-medium maturity - limited tools/processes, minimal technical team',
        recommendation: 'Borderline fit - may require more training/setup than consulting. Assess carefully.'
      };
    }
    if (value >= 0.15) {
      return {
        level: 'low',
        meaning: 'Low digital maturity - few tools, informal processes, no technical team',
        recommendation: 'Poor fit for consulting - needs foundational digital transformation first'
      };
    }
    return {
      level: 'very-low',
      meaning: 'Very low maturity - primarily manual operations, no digital infrastructure',
      recommendation: 'Disqualify or refer to digital transformation basics: "Recomendamos primero establecer herramientas básicas..."'
    };
  }
}

export class SMBFitScoreMetric extends SelfDocumentingMetric {
  constructor() {
    super('smb_fit_score', 'SMB Consulting Fit Score', 'meta', 'overall-fit');
  }

  what(): string {
    return 'Composite score assessing overall fit for SMB consulting: budget ≥5,000€, SPOC ≥4hrs/week, medium digital maturity';
  }

  why(): string {
    return 'Combines the three critical SMB consulting qualifiers into a single decision metric. All three must be met for project viability and success.';
  }

  how(): string {
    return 'Weighted average: (BudgetQualification × 0.4 + SPOCAvailability × 0.3 + DigitalMaturity × 0.3). All components must be >0.5 for overall fit.';
  }

  when(): string {
    return 'Updated whenever any of the three component metrics (budget, SPOC, digital maturity) changes';
  }

  range(): { min: number; max: number; ideal?: [number, number] } {
    return { min: 0, max: 1, ideal: [0.7, 1.0] };
  }

  interpret(value: number): InterpretationResult {
    if (value >= 0.8) {
      return {
        level: 'very-high',
        meaning: 'Excellent SMB consulting fit - all qualifiers strongly met (budget, SPOC, maturity)',
        recommendation: 'HIGH PRIORITY LEAD - Move to proposal immediately. This prospect is ideal.'
      };
    }
    if (value >= 0.65) {
      return {
        level: 'high',
        meaning: 'Good SMB fit - most qualifiers met, minor gaps to address',
        recommendation: 'QUALIFIED LEAD - Confirm any weak qualifier explicitly before proposal'
      };
    }
    if (value >= 0.5) {
      return {
        level: 'moderate',
        meaning: 'Moderate fit - one or more qualifiers partially met, needs further qualification',
        recommendation: 'CONTINUE QUALIFYING - Focus on weakest dimension (budget, SPOC, or maturity)'
      };
    }
    if (value >= 0.35) {
      return {
        level: 'low',
        meaning: 'Poor fit - significant gaps in qualifiers (budget, SPOC, or maturity)',
        recommendation: 'LOW PRIORITY - Consider disqualifying unless gaps can be resolved quickly'
      };
    }
    return {
      level: 'very-low',
      meaning: 'Not qualified - multiple critical qualifiers not met',
      recommendation: 'DISQUALIFY - Politely end conversation or refer to alternative services'
    };
  }
}

// ============================================================================
// METRIC REGISTRY
// ============================================================================

/**
 * Central registry of all self-documenting metrics
 */
export class MetricRegistry {
  private metrics: Map<string, SelfDocumentingMetric> = new Map();

  constructor() {
    this.registerDefaultMetrics();
  }

  /**
   * Register default metrics
   */
  private registerDefaultMetrics(): void {
    const defaultMetrics = [
      new ResponseVelocityMetric(),
      new MessageDepthRatioMetric(),
      new BudgetSignalStrengthMetric(),
      new AuthorityScoreMetric(),
      new TrustLevelMetric(),
      new FormalityIndexMetric(),
      // SMB-specific consulting metrics
      new BudgetQualificationMetric(),
      new SPOCAvailabilityMetric(),
      new DigitalMaturityMetric(),
      new SMBFitScoreMetric()
    ];

    for (const metric of defaultMetrics) {
      this.register(metric.id, metric);
    }
  }

  /**
   * Register a new metric
   */
  register(id: string, metric: SelfDocumentingMetric): void {
    this.metrics.set(id, metric);
  }

  /**
   * Get a metric by ID
   */
  get(id: string): SelfDocumentingMetric | undefined {
    return this.metrics.get(id);
  }

  /**
   * List all registered metrics
   */
  listAll(): SelfDocumentingMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics by dimension
   */
  getByDimension(dimension: string): SelfDocumentingMetric[] {
    return this.listAll().filter(m => m.dimension === dimension);
  }

  /**
   * Explain a specific metric value
   */
  explainMetric(metricId: string, context: MetricContext): string | null {
    const metric = this.get(metricId);
    if (!metric) return null;
    return metric.explain(context);
  }

  /**
   * Get all metric documentation as JSON
   */
  getAllDocumentation(): any {
    return this.listAll().map(m => m.toJSON());
  }
}

// Export singleton instance
export const metricRegistry = new MetricRegistry();