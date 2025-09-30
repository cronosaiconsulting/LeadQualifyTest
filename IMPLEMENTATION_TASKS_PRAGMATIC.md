# Implementation Tasks - Pragmatic Architecture
## Lead Qualification AI System - Aligned with Actual Requirements

**Project:** B2B Lead Qualification via WhatsApp with Multi-Dimensional Situation Awareness
**Approach:** Pragmatic, instruction-aligned architecture
**Priority:** LIFE-SAVING (Maximum priority per instructions)
**Timeline:** 20 days (vs 37-40 days for over-engineered approach)

**See ARCHITECTURAL_DEBATE.md for full reasoning behind this approach.**

---

## 📊 CURRENT STATUS ASSESSMENT

### What's Already Working (65% Complete)

✅ **Core Infrastructure**
- PostgreSQL + Drizzle ORM (structured + JSONB storage)
- Express.js + TypeScript backend
- React + TypeScript frontend
- WhatsApp Business API integration
- WebSocket real-time updates

✅ **Decision Engine**
- Multi-dimensional metrics (7 dimensions × 3-5 groups × 2-3 metrics)
- Utility-based question selection
- Thompson Sampling for exploration/exploitation
- xAI Grok integration for reasoning

✅ **Supporting Services**
- Decision tracing and audit trail
- Safety and validation
- Structured logging
- Pattern tracking (knowledge-graph.ts)

### What's Missing (35% Remaining)

❌ **Message Humanization**
- Raw questions sent, no conversational wrapping
- No greeting/transition/acknowledgment system
- No context-aware message composition

❌ **Spanish/LATAM Adaptation**
- No spaCy Spanish NLP
- No cultural adaptation rules
- No formality detection (tú/usted)
- No regional vocabulary mapping

❌ **Explainability Enhancements**
- Metrics don't self-document (what/why/how)
- No human-readable metric explanations
- Limited debugging interface for experts

❌ **Dynamic Evolution**
- No AI-suggested metrics
- No shadow mode testing for new metrics
- No human approval workflow

❌ **Self-Healing**
- No LLM-based code repair
- No GitHub automation for fixes

❌ **Infrastructure**
- No .env file setup
- No /doc folder documentation
- No /test folder with test suite

---

## 🎯 IMPLEMENTATION PHASES

## PHASE 0: MESSAGE HUMANIZATION (Days 1-2)
**Priority:** CRITICAL | **Estimated:** 2 days
**Rationale:** B2B conversations must be natural, not robotic question dumps

### Task 0.1: MessageComposer Service
**Priority:** CRITICAL | **Estimated:** 10-12 hours

#### Architecture:
```typescript
class MessageComposer {
  // Conversation state machine
  determineConversationPhase(state: ConversationState): Phase;

  // Template-based generation
  selectGreeting(phase: Phase, timeOfDay: string, returning: boolean): string;
  wrapQuestion(question: Question, context: Context): string;
  generateTransition(previousTopic: string, nextTopic: string): string;
  createAcknowledgment(userResponse: string, sentiment: Sentiment): string;

  // Final composition
  composeMessage(components: MessageComponents): string;

  // Quality checks
  validateMessage(message: string): ValidationResult;
}
```

#### Subtasks:
- [ ] 0.1.1 Create MessageComposer service class
  - [ ] Implement conversation state machine (greeting, exploration, qualification, deepening, closing)
  - [ ] Add phase transition logic
  - [ ] Create context tracking system

- [ ] 0.1.2 Build greeting/introduction system
  - [ ] Time-of-day greetings (Buenos días/Buenas tardes/Buenas noches)
  - [ ] First-contact introduction ("Soy Lidia de Cronos AI Consulting")
  - [ ] Returning user greetings
  - [ ] Permission-asking patterns ("¿Sería un buen momento?")

- [ ] 0.1.3 Implement question wrapping
  - [ ] Acknowledgment generator ("Entiendo...", "Gracias por compartir...")
  - [ ] Transition phrases ("Me gustaría saber...", "Por otro lado...")
  - [ ] Context bridges ("Relacionado con lo que mencionaste...")
  - [ ] Natural connectors

- [ ] 0.1.4 Create template library
  - [ ] JSON-based template structure
  - [ ] Variable injection system ({{company}}, {{name}}, {{topic}})
  - [ ] A/B testing variants
  - [ ] Regional variations (Spain, Mexico, Colombia, Argentina)

- [ ] 0.1.5 Add quality validation
  - [ ] Length optimization (30-100 words ideal for WhatsApp)
  - [ ] Readability scoring
  - [ ] Tone consistency checker
  - [ ] Emoji usage rules (professional B2B context)

**Success Criteria:**
- Every message includes proper greeting on first contact
- Questions wrapped in conversational context
- Smooth transitions between topics
- User responses acknowledged naturally
- A/B test shows >2x engagement improvement

---

## PHASE 1: SPANISH ADAPTATION (Days 3-5)
**Priority:** CRITICAL | **Estimated:** 3 days
**Rationale:** Instructions explicitly require Spanish/LATAM B2B cultural adaptation

### Task 1.1: spaCy Spanish NLP Integration
**Priority:** CRITICAL | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 1.1.1 Install and configure spaCy
  ```bash
  pip install spacy
  python -m spacy download es_core_news_lg
  pip install spacy-transformers  # Optional: for sentiment
  ```

- [ ] 1.1.2 Create SpanishNLPService
  ```typescript
  class SpanishNLPService {
    // Entity extraction
    extractEntities(text: string): Entity[];

    // Sentiment analysis
    analyzeSentiment(text: string): SentimentResult;

    // Formality detection
    detectFormality(text: string): 'formal' | 'informal';

    // Business signal detection
    detectBudgetSignals(text: string): BudgetSignal[];
    detectAuthoritySignals(text: string): AuthoritySignal[];
    detectUrgencySignals(text: string): UrgencySignal[];
  }
  ```

- [ ] 1.1.3 Integrate with metrics.ts
  - [ ] Pass messages through spaCy pipeline
  - [ ] Extract entities for qualification metrics
  - [ ] Use sentiment for emotional dimension
  - [ ] Apply formality detection for cultural metrics

- [ ] 1.1.4 Test Spanish NER accuracy
  - [ ] Create test dataset (50 Spanish B2B messages)
  - [ ] Measure entity extraction accuracy (target: >90%)
  - [ ] Validate business signal detection

**Success Criteria:**
- spaCy processes messages <50ms each
- Entity extraction accuracy >90% for companies, people, money, dates
- Budget signal detection accuracy >85%
- Formality detection accuracy >95%

---

### Task 1.2: Cultural Adaptation Rules
**Priority:** CRITICAL | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 1.2.1 Create cultural rule engine
  ```typescript
  class CulturalAdapter {
    // Formality adaptation
    adjustFormality(message: string, level: 'tu' | 'usted'): string;

    // Regional vocabulary
    applyRegionalVocabulary(message: string, region: Region): string;

    // Business etiquette
    applyB2BNorms(message: string, stage: ConversationStage): string;

    // Timing awareness
    checkBusinessHours(region: Region): boolean;
    checkCulturalCalendar(region: Region): HolidayInfo;
  }
  ```

- [ ] 1.2.2 Build regional vocabulary maps
  - [ ] Spain (peninsular Spanish, direct style)
  - [ ] Mexico (formal, relationship-oriented)
  - [ ] Colombia (warm, indirect)
  - [ ] Argentina (informal, unique vocabulary - "vos")
  - [ ] General LATAM (safe defaults)

- [ ] 1.2.3 Define B2B communication patterns
  - [ ] Introduction protocols (formal in first message)
  - [ ] Relationship building phases (trust before price)
  - [ ] Credibility statements (company references, case studies)
  - [ ] Decision-making styles (consensus vs individual)

- [ ] 1.2.4 Implement cultural calendar
  - [ ] Regional holidays (Día de la Hispanidad, Día de Muertos, etc.)
  - [ ] Business hour adjustments (siesta in Spain)
  - [ ] Peak response times by region

**Success Criteria:**
- Formality correctly applied in >95% of messages
- Regional vocabulary naturally integrated
- Cultural calendar prevents messages during holidays
- B2B etiquette rules consistently followed

---

### Task 1.3: Language-Specific Metrics
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 1.3.1 Create Spanish keyword dictionaries
  ```typescript
  const SPANISH_SIGNALS = {
    budget_explicit: ['presupuesto', 'inversión', 'euros', 'dólares', 'coste'],
    budget_implicit: ['cuánto', 'precio', 'tarifa', 'cotizar'],
    urgency_high: ['urgente', 'ya', 'pronto', 'inmediato', 'cuanto antes'],
    urgency_medium: ['próximamente', 'planificando', 'en breve'],
    authority_high: ['soy el director', 'tengo autoridad', 'decido'],
    authority_medium: ['en mi equipo', 'nosotros', 'consultaremos'],
    confusion: ['no entiendo', 'no me queda claro', 'explícame'],
    frustration: ['complicado', 'difícil', 'no tengo tiempo'],
    enthusiasm: ['excelente', 'perfecto', 'me interesa', 'genial']
  };
  ```

- [ ] 1.3.2 Enhance metric calculations with Spanish NLP
  - [ ] Budget signal detection uses spaCy + keyword dictionary
  - [ ] Authority detection uses pronoun analysis (tú/usted, yo/nosotros)
  - [ ] Emotional metrics use sentiment analysis
  - [ ] Technical sophistication uses domain-specific term detection

- [ ] 1.3.3 Add cultural dimension metrics
  - [ ] Formality index (formal/informal language ratio)
  - [ ] Relationship-building score (personal vs transactional)
  - [ ] Regional pattern matching (Spain vs LATAM styles)

**Success Criteria:**
- Budget detection accuracy improves by >20%
- Authority scoring more accurate with Spanish pronouns
- Cultural dimension provides actionable insights
- All metrics work correctly with Spanish input

---

## PHASE 2: EXPLAINABILITY ENHANCEMENTS (Days 6-7)
**Priority:** CRITICAL | **Estimated:** 2 days
**Rationale:** Instructions require "every metric must self-document"

### Task 2.1: Metric Self-Documentation System
**Priority:** CRITICAL | **Estimated:** 1 day (8 hours)

#### Architecture:
```typescript
abstract class SelfDocumentingMetric {
  abstract what(): string;  // What this metric measures
  abstract why(): string;   // Why it matters for lead qualification
  abstract how(): string;   // Calculation formula/method
  abstract when(): string;  // When it gets updated
  abstract interpret(value: number): InterpretationResult;

  // Automatic explanation generation
  explain(context: MetricContext): string {
    return `${this.what()}. Currently ${context.value} because ${this.interpretReason(context)}.`;
  }
}

// Example implementation
class ResponseVelocityMetric extends SelfDocumentingMetric {
  what(): string {
    return "Response Velocity measures how quickly the prospect replies relative to expected baseline";
  }

  why(): string {
    return "Fast responses indicate high interest and priority. Slow responses suggest lower engagement or competing priorities";
  }

  how(): string {
    return "1 / (avg_response_time_seconds / baseline_expected_seconds)";
  }

  when(): string {
    return "After each prospect message is received";
  }

  interpret(value: number): InterpretationResult {
    if (value > 1.2) return { level: 'high', meaning: 'Highly engaged, prioritizing conversation' };
    if (value > 0.7) return { level: 'good', meaning: 'Good engagement level' };
    if (value > 0.3) return { level: 'moderate', meaning: 'Moderate engagement, may have other priorities' };
    return { level: 'low', meaning: 'Low engagement, likely disengaged' };
  }
}
```

#### Subtasks:
- [ ] 2.1.1 Create SelfDocumentingMetric base class
  - [ ] Define interface with what/why/how/when/interpret methods
  - [ ] Implement automatic explanation generation
  - [ ] Add human-readable formatting

- [ ] 2.1.2 Implement self-documentation for all metrics
  - [ ] Engagement metrics (velocity, depth, consistency, etc.) - 8 metrics
  - [ ] Qualification metrics (budget, authority, need, timeline) - 10 metrics
  - [ ] Technical metrics (sophistication, scope, maturity) - 7 metrics
  - [ ] Emotional metrics (trust, frustration, enthusiasm) - 6 metrics
  - [ ] Cultural metrics (formality, style, region) - 5 metrics
  - [ ] Meta metrics (flow, coverage, confidence) - 8 metrics
  - **Total: ~44 metrics to document**

- [ ] 2.1.3 Create MetricRegistry
  ```typescript
  class MetricRegistry {
    private metrics: Map<string, SelfDocumentingMetric> = new Map();

    register(name: string, metric: SelfDocumentingMetric): void;
    get(name: string): SelfDocumentingMetric;
    listAll(): MetricDescriptor[];
    explainMetric(name: string, context: MetricContext): string;
  }
  ```

- [ ] 2.1.4 Add metric documentation API endpoint
  ```typescript
  // GET /api/metrics/documentation
  // Returns all metric descriptions

  // GET /api/metrics/:metricName/explain?value=0.7&context={...}
  // Returns human-readable explanation for specific value
  ```

**Success Criteria:**
- All 44 metrics have complete self-documentation
- Explanations are clear and actionable for human experts
- Metric registry accessible via API
- Documentation auto-generated from code (no manual docs needed)

---

### Task 2.2: Debug Dashboard for Human Experts
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Components:
```
DebugDashboard (React + TypeScript)
├── MetricInspector
│   ├── View all dimensions and their current values
│   ├── See calculation formulas for each metric
│   ├── Hover tooltips with self-documentation
│   └── Historical trend charts
│
├── DecisionReplay
│   ├── Step-by-step reasoning traces
│   ├── Candidate questions considered
│   ├── Utility scores breakdown
│   ├── Why this question was chosen
│   └── Alternative options and their scores
│
├── PatternAnalyzer
│   ├── Learned patterns visualization
│   ├── Pattern match history
│   ├── Success rates per pattern
│   └── Pattern suggestion from AI
│
├── ConversationSimulator
│   ├── Load historical conversation
│   ├── Replay decisions
│   ├── Test alternative questions
│   └── Compare outcomes
│
└── MetricEvolutionUI (see Phase 3)
    ├── View proposed new metrics
    ├── Shadow mode test results
    ├── Approve/reject new metrics
    └── Metric version history
```

#### Subtasks:
- [ ] 2.2.1 Create MetricInspector component
  - [ ] Display all 7 dimensions in expandable cards
  - [ ] Show real-time values with confidence intervals
  - [ ] Add calculation formula tooltips
  - [ ] Implement historical trend charts (last 10 conversations)

- [ ] 2.2.2 Build DecisionReplay component
  - [ ] Fetch decision traces from database
  - [ ] Render step-by-step reasoning
  - [ ] Show candidate questions with scores
  - [ ] Highlight selected question and justification
  - [ ] Allow filtering by conversation ID or date range

- [ ] 2.2.3 Create PatternAnalyzer component
  - [ ] Visualize learned patterns from pattern_library
  - [ ] Show pattern match confidence
  - [ ] Display success rates per pattern type
  - [ ] Allow manual pattern creation/editing

- [ ] 2.2.4 Implement ConversationSimulator
  - [ ] Load conversation by ID
  - [ ] Replay message-by-message with decision points
  - [ ] Allow "what-if" testing (choose different questions)
  - [ ] Compare metrics across different paths

**Success Criteria:**
- Human expert can understand any decision in <2 minutes
- All metrics inspectable with formulas visible
- Decision replay shows complete reasoning trace
- Pattern analysis reveals learned behaviors
- Simulator enables hypothesis testing

---

## PHASE 3: DYNAMIC METRIC EVOLUTION (Days 8-11)
**Priority:** HIGH | **Estimated:** 4 days
**Rationale:** Instructions explicitly require "system suggests new metrics or upgrades"

### Task 3.1: AI-Powered Metric Suggestion System
**Priority:** HIGH | **Estimated:** 2 days (16 hours)

#### Architecture:
```typescript
class MetricEvolutionSystem {
  // Anomaly detection
  detectAnomalies(conversations: Conversation[]): Anomaly[];

  // Gap analysis
  analyzeGaps(dimensions: Dimension[]): GapAnalysis[];

  // AI suggestion
  async suggestNewMetrics(context: EvolutionContext): Promise<MetricProposal[]>;

  // Shadow mode testing
  async testMetricInShadowMode(metric: ProposedMetric, conversations: Conversation[]): Promise<ShadowTestResult>;

  // Human approval
  createApprovalRequest(proposal: MetricProposal): ApprovalRequest;

  // Activation
  activateMetric(approvedMetric: ApprovedMetric): void;
}
```

#### Subtasks:
- [ ] 3.1.1 Implement anomaly detection
  ```typescript
  // Detect conversations that don't fit existing patterns
  function detectAnomalies(conversations: Conversation[]): Anomaly[] {
    // 1. Find conversations with unexpected outcomes
    //    - High engagement but no qualification
    //    - Low engagement but successful qualification
    //    - High confidence but wrong decision
    //
    // 2. Identify metric blind spots
    //    - Dimensions with low predictive power
    //    - Metrics that don't correlate with outcomes
    //    - Missing signals (user says X, no metric captures it)
    //
    // 3. Return anomaly reports for human review
  }
  ```

- [ ] 3.1.2 Build gap analysis engine
  ```typescript
  // Analyze which dimensions are weak
  function analyzeGaps(dimensions: Dimension[]): GapAnalysis[] {
    // 1. Calculate predictive power of each metric
    //    - Correlation with successful qualification
    //    - Variance explained
    //    - Information gain
    //
    // 2. Identify underperforming dimensions
    //    - Dimensions with low overall scores
    //    - Metrics that rarely change values
    //    - Groups with only 1-2 metrics (should have 2-3+)
    //
    // 3. Return prioritized gap list
  }
  ```

- [ ] 3.1.3 Create AI metric suggestion via xAI
  ```typescript
  // Use xAI Grok to suggest new metrics
  async function suggestNewMetrics(context: EvolutionContext): Promise<MetricProposal[]> {
    const prompt = `
    You are a data scientist analyzing a B2B lead qualification system.

    Current dimensions: ${context.dimensions}
    Current metrics: ${context.metrics}

    Anomalies detected: ${context.anomalies}
    Gap analysis: ${context.gaps}

    Suggest 2-3 new metrics that would:
    1. Fill identified gaps
    2. Improve predictive power
    3. Be calculable with lightweight approximations (no heavy ML)
    4. Fit into existing dimension structure

    For each metric, provide:
    - Name
    - Dimension and group it belongs to
    - What it measures
    - Why it matters
    - How to calculate it (formula)
    - Expected value range
    - When to update it
    `;

    const response = await xaiService.chat(prompt);
    return parseMetricProposals(response);
  }
  ```

- [ ] 3.1.4 Implement shadow mode testing
  ```typescript
  // Test new metric on historical conversations without affecting decisions
  async function testMetricInShadowMode(
    metric: ProposedMetric,
    conversations: Conversation[]
  ): Promise<ShadowTestResult> {
    // 1. Calculate new metric for all historical conversations
    // 2. Compare with actual outcomes
    // 3. Measure: predictive power, correlation, variance
    // 4. Check: does it provide new information? or redundant with existing metrics?
    // 5. Return test report with recommendation (approve/reject)
  }
  ```

**Success Criteria:**
- System detects anomalies in conversations automatically
- Gap analysis identifies weak dimensions/metrics
- xAI suggests 2-3 relevant metrics per week
- Shadow mode tests metrics on historical data
- Test report clearly shows if metric adds value

---

### Task 3.2: Metric Approval Workflow & Versioning
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 3.2.1 Create approval workflow database tables
  ```sql
  CREATE TABLE metric_proposals (
    id TEXT PRIMARY KEY,
    proposed_metric JSONB NOT NULL,
    suggestion_reasoning TEXT,
    shadow_test_results JSONB,
    status TEXT, -- 'pending', 'approved', 'rejected'
    created_at TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by TEXT
  );
  ```

- [ ] 3.2.2 Build ApprovalUI component
  - [ ] List pending metric proposals
  - [ ] Show metric description (what/why/how)
  - [ ] Display shadow test results (graphs, correlations)
  - [ ] Approve/reject buttons with reason field
  - [ ] Email notification to admin when new proposal

- [ ] 3.2.3 Implement metric versioning
  ```typescript
  // Version format: MAJOR.MINOR.PATCH
  // MAJOR: Breaking change (dimension added/removed)
  // MINOR: Non-breaking change (metric added, group added)
  // PATCH: Formula tweak, bug fix

  class MetricVersioning {
    currentVersion(): string;
    migrate(fromVersion: string, toVersion: string, data: any): any;
    isCompatible(version1: string, version2: string): boolean;
  }
  ```

- [ ] 3.2.4 Add backward compatibility layer
  - [ ] Convert old metric format to new format
  - [ ] Handle missing metrics in old conversations
  - [ ] Preserve historical data integrity

**Success Criteria:**
- Metric proposals stored with complete context
- Human expert can review proposals with shadow test data
- Approval workflow is smooth and fast (<5 minutes per metric)
- Versioning prevents breaking changes
- Historical conversations remain queryable after metric changes

---

### Task 3.3: Automated Metric Monitoring
**Priority:** MEDIUM | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 3.3.1 Create metric health monitoring
  ```typescript
  class MetricHealthMonitor {
    // Check if metric is still useful
    checkMetricHealth(metric: Metric, conversations: Conversation[]): HealthReport;

    // Detect drift in metric behavior
    detectDrift(metric: Metric, historicalData: any[]): DriftReport;

    // Suggest deprecation if metric is no longer useful
    suggestDeprecation(metric: Metric, healthReport: HealthReport): boolean;
  }
  ```

- [ ] 3.3.2 Implement weekly health reports
  - [ ] Generate report every 7 days
  - [ ] Include: metric usage, predictive power, drift detection
  - [ ] Send report to admin email
  - [ ] Store reports in database for historical analysis

- [ ] 3.3.3 Add metric performance dashboard
  - [ ] Show correlation of each metric with successful qualification
  - [ ] Display metric value distribution (histograms)
  - [ ] Highlight metrics with low variance (always same value = useless)
  - [ ] Flag metrics that may need recalibration

**Success Criteria:**
- Metric health monitored automatically
- Weekly reports highlight problems
- Deprecated metrics identified automatically
- Performance dashboard shows which metrics are most valuable

---

## PHASE 4: SELF-HEALING SYSTEM (Days 12-14)
**Priority:** HIGH | **Estimated:** 3 days
**Rationale:** Instructions require "LLM can repair code via GitHub commits"

### Task 4.1: Error Detection & Diagnostics
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 4.1.1 Create comprehensive error logging
  ```typescript
  class ErrorDetectionSystem {
    // Catch and classify errors
    captureError(error: Error, context: ErrorContext): ErrorReport;

    // Classify error severity
    classifyError(error: Error): 'critical' | 'high' | 'medium' | 'low';

    // Gather diagnostic context
    gatherContext(error: Error): DiagnosticContext;

    // Determine if self-healing is possible
    isSelfHealable(error: ErrorReport): boolean;
  }
  ```

- [ ] 4.1.2 Implement error classification
  - [ ] **Critical:** System crash, database connection lost, xAI API completely down
  - [ ] **High:** Specific conversation failures, metric calculation errors, decision selection failures
  - [ ] **Medium:** Occasional WhatsApp message failures, minor data inconsistencies
  - [ ] **Low:** Logging errors, non-critical service degradation

- [ ] 4.1.3 Build diagnostic context gatherer
  - [ ] Stack traces with source code lines
  - [ ] Recent logs (last 100 lines)
  - [ ] Relevant database state
  - [ ] Environment variables (sanitized, no secrets)
  - [ ] Recent code changes (git diff)

- [ ] 4.1.4 Add anomaly detection
  - [ ] Detect metric calculation anomalies (values outside expected range)
  - [ ] Detect decision-making anomalies (no candidates, low confidence)
  - [ ] Detect conversation anomalies (infinite loops, stuck states)

**Success Criteria:**
- All errors captured with full context
- Error classification accurate (>95%)
- Diagnostic context complete enough for LLM to diagnose
- Self-healable errors identified automatically

---

### Task 4.2: LLM-Based Code Repair
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Architecture:
```typescript
class SelfHealingSystem {
  // Diagnose error using LLM
  async diagnoseError(errorReport: ErrorReport): Promise<Diagnosis>;

  // Generate fix using LLM
  async generateFix(diagnosis: Diagnosis): Promise<CodeFix>;

  // Test fix locally
  async testFix(fix: CodeFix): Promise<TestResult>;

  // Apply fix if tests pass
  async applyFix(fix: CodeFix, testResult: TestResult): Promise<ApplyResult>;
}
```

#### Subtasks:
- [ ] 4.2.1 Create error diagnosis prompt for xAI
  ```typescript
  async function diagnoseError(errorReport: ErrorReport): Promise<Diagnosis> {
    const prompt = `
    You are a senior TypeScript developer debugging a production error.

    Error: ${errorReport.error.message}
    Stack trace: ${errorReport.stackTrace}

    Code context:
    ${errorReport.sourceCode}

    Recent changes:
    ${errorReport.recentGitDiff}

    Environment:
    ${errorReport.environment}

    Diagnose:
    1. What caused this error?
    2. What is the root cause?
    3. What code needs to change?
    4. What is the risk of the fix?
    `;

    const response = await xaiService.chat(prompt);
    return parseDiagnosis(response);
  }
  ```

- [ ] 4.2.2 Implement code fix generation
  ```typescript
  async function generateFix(diagnosis: Diagnosis): Promise<CodeFix> {
    const prompt = `
    You are a senior TypeScript developer implementing a bug fix.

    Diagnosis: ${diagnosis.rootCause}

    Current code:
    ${diagnosis.faultyCode}

    Generate a fix:
    1. Provide the corrected code
    2. Explain what changed and why
    3. List any side effects or risks
    4. Suggest test cases to validate the fix

    Return JSON:
    {
      "filePath": "path/to/file.ts",
      "originalCode": "...",
      "fixedCode": "...",
      "explanation": "...",
      "risks": [...],
      "testCases": [...]
    }
    `;

    const response = await xaiService.chat(prompt);
    return parseCodeFix(response);
  }
  ```

- [ ] 4.2.3 Build automated testing for fixes
  - [ ] Apply fix to temporary branch
  - [ ] Run existing test suite
  - [ ] Run LLM-suggested test cases
  - [ ] Check if error is resolved
  - [ ] Revert if tests fail

- [ ] 4.2.4 Add safety checks
  - [ ] Never auto-fix critical files (database migrations, auth)
  - [ ] Require human approval for high-risk fixes
  - [ ] Limit auto-fix attempts (max 3 per error)
  - [ ] Always create Git branch (never commit to main)

**Success Criteria:**
- xAI successfully diagnoses error root cause in >80% of cases
- Generated fixes are syntactically correct in >90% of cases
- Automated tests catch bad fixes before deployment
- Safety checks prevent dangerous auto-fixes

---

### Task 4.3: GitHub Automation
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 4.3.1 Set up GitHub API integration
  - [ ] Install @octokit/rest
  - [ ] Configure authentication with GitHub personal access token
  - [ ] Test API connection

- [ ] 4.3.2 Implement Git operations
  ```typescript
  class GitHubAutomation {
    // Create branch for fix
    async createBranch(baseBranch: string, fixId: string): Promise<Branch>;

    // Commit fix
    async commitFix(branch: Branch, fix: CodeFix): Promise<Commit>;

    // Create pull request
    async createPullRequest(branch: Branch, diagnosis: Diagnosis): Promise<PullRequest>;

    // Add labels and assignees
    async annotatePR(pr: PullRequest, metadata: PRMetadata): Promise<void>;
  }
  ```

- [ ] 4.3.3 Create PR template for self-healing
  ```markdown
  ## 🤖 Self-Healing Fix

  **Error:** {{error.message}}
  **Severity:** {{error.severity}}
  **Timestamp:** {{error.timestamp}}

  ### Diagnosis
  {{diagnosis.rootCause}}

  ### Fix Applied
  {{fix.explanation}}

  ### Test Results
  - ✅ Existing tests: {{testResult.existingTests}}
  - ✅ New test cases: {{testResult.newTests}}

  ### Risks
  {{fix.risks}}

  ### Review Required
  - [ ] Verify fix addresses root cause
  - [ ] Check for side effects
  - [ ] Approve or reject

  ---
  🤖 Generated by Self-Healing System
  ```

- [ ] 4.3.4 Implement human approval workflow
  - [ ] Send notification to admin (email, Slack, etc.)
  - [ ] PR requires manual review before merge
  - [ ] High-risk fixes flagged for extra scrutiny
  - [ ] Auto-merge only for low-risk, well-tested fixes

**Success Criteria:**
- Self-healing creates branch, commits, and opens PR automatically
- PR includes complete context (error, diagnosis, fix, tests)
- Human approval required for merge
- Git history is clean and traceable

---

## PHASE 5: INFRASTRUCTURE & DOCUMENTATION (Days 15-16)
**Priority:** MEDIUM | **Estimated:** 2 days
**Rationale:** Instructions require .env, /doc, /test for minimal setup

### Task 5.1: Environment Configuration
**Priority:** MEDIUM | **Estimated:** 0.5 day (4 hours)

#### Subtasks:
- [ ] 5.1.1 Create .env.example file
  ```bash
  # Database
  DATABASE_URL=postgresql://user:password@localhost:5432/leadqualify

  # AI Services
  XAI_API_KEY=your_xai_api_key_here
  OPENAI_API_KEY=your_openai_api_key_here  # Fallback

  # WhatsApp Business API
  WHATSAPP_ACCESS_TOKEN=your_whatsapp_token
  WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
  WHATSAPP_VERIFY_TOKEN=your_verify_token
  WHATSAPP_WEBHOOK_TOKEN=your_webhook_token

  # Server
  PORT=5000
  NODE_ENV=development

  # GitHub (for self-healing)
  GITHUB_TOKEN=your_github_token
  GITHUB_REPO=owner/repo

  # Admin Notifications
  ADMIN_EMAIL=admin@company.com
  SMTP_HOST=smtp.gmail.com
  SMTP_USER=your_email
  SMTP_PASS=your_password

  # Optional: Caching
  REDIS_URL=redis://localhost:6379
  ```

- [ ] 5.1.2 Create setup script
  ```bash
  #!/bin/bash
  # setup.sh - One-command setup

  echo "Setting up Lead Qualification AI..."

  # Check dependencies
  command -v node >/dev/null 2>&1 || { echo "Node.js required"; exit 1; }
  command -v psql >/dev/null 2>&1 || { echo "PostgreSQL required"; exit 1; }

  # Install npm packages
  npm install

  # Copy .env.example to .env
  cp .env.example .env
  echo "Please edit .env with your credentials"

  # Run database migrations
  npm run db:migrate

  # Seed question bank
  npm run db:seed

  # Install spaCy Spanish model
  python3 -m spacy download es_core_news_lg

  echo "Setup complete! Run 'npm run dev' to start."
  ```

- [ ] 5.1.3 Add environment validation on startup
  - [ ] Check all required env vars present
  - [ ] Test database connection
  - [ ] Test xAI API key
  - [ ] Test WhatsApp API connection
  - [ ] Fail fast with clear error messages

**Success Criteria:**
- Single .env file contains all configuration
- Setup script works on fresh Linux system
- Environment validation catches missing config

---

### Task 5.2: Documentation Folder
**Priority:** MEDIUM | **Estimated:** 0.5 day (4 hours)

#### Structure:
```
/doc
├── architecture/
│   ├── README.md (system overview)
│   ├── decision-flow.md (how question selection works)
│   ├── metrics-framework.md (7 dimensions explained)
│   └── data-model.md (database schema)
│
├── api/
│   ├── REST-endpoints.md
│   ├── WebSocket-events.md
│   └── schemas.json (JSON schemas for API)
│
├── deployment/
│   ├── setup-guide.md
│   ├── production-deployment.md
│   └── troubleshooting.md
│
├── development/
│   ├── contributing.md
│   ├── code-style.md
│   └── testing.md
│
└── user-guides/
    ├── debugging-dashboard.md
    ├── metric-evolution.md
    └── self-healing-system.md
```

#### Subtasks:
- [ ] 5.2.1 Write architecture documentation
  - [ ] System overview with component diagram
  - [ ] Decision flow explanation
  - [ ] Metrics framework (7 dimensions, self-documentation)
  - [ ] Database schema and relationships

- [ ] 5.2.2 Document API
  - [ ] REST endpoint specs (OpenAPI format)
  - [ ] WebSocket event catalog
  - [ ] JSON schema definitions

- [ ] 5.2.3 Create deployment guide
  - [ ] Step-by-step setup instructions
  - [ ] Production deployment checklist
  - [ ] Common issues and solutions

- [ ] 5.2.4 Write user guides
  - [ ] How to use debugging dashboard
  - [ ] How to review metric proposals
  - [ ] How to handle self-healing PRs

**Success Criteria:**
- Complete /doc folder with all required documentation
- New developer can understand system architecture in <1 hour
- Deployment guide enables setup in <30 minutes

---

### Task 5.3: Test Infrastructure
**Priority:** MEDIUM | **Estimated:** 1 day (8 hours)

#### Structure:
```
/test
├── unit/
│   ├── metrics.test.ts (metric calculations)
│   ├── decision.test.ts (question selection)
│   ├── thompson-sampling.test.ts (learning algorithms)
│   ├── message-composer.test.ts (humanization)
│   └── spanish-nlp.test.ts (spaCy integration)
│
├── integration/
│   ├── api.test.ts (REST endpoints)
│   ├── whatsapp.test.ts (WhatsApp integration)
│   ├── websocket.test.ts (real-time updates)
│   └── database.test.ts (data persistence)
│
├── e2e/
│   ├── conversation-flow.test.ts (full qualification flow)
│   ├── metric-evolution.test.ts (metric proposal workflow)
│   └── self-healing.test.ts (error detection and fix)
│
├── fixtures/
│   ├── conversations/ (sample WhatsApp conversations)
│   ├── questions/ (test question bank)
│   └── metrics/ (expected metric values)
│
└── README.md (how to run tests)
```

#### Subtasks:
- [ ] 5.3.1 Set up testing framework
  - [ ] Install Vitest (fast, TypeScript-native)
  - [ ] Configure test environment
  - [ ] Add test scripts to package.json

- [ ] 5.3.2 Write unit tests
  - [ ] Metric calculation accuracy (target: 100% coverage)
  - [ ] Question selection logic (utility scoring, Thompson Sampling)
  - [ ] Message composition (greeting, wrapping, transitions)
  - [ ] Spanish NLP (entity extraction, sentiment, formality)

- [ ] 5.3.3 Write integration tests
  - [ ] API endpoint tests (all routes)
  - [ ] WhatsApp webhook handling
  - [ ] WebSocket message flow
  - [ ] Database CRUD operations

- [ ] 5.3.4 Write E2E tests
  - [ ] Complete conversation flow (greeting → qualification → decision)
  - [ ] Metric evolution workflow (detect anomaly → suggest metric → shadow test → approve)
  - [ ] Self-healing cycle (error → diagnose → fix → PR)

- [ ] 5.3.5 Add CI/CD integration
  - [ ] GitHub Actions workflow
  - [ ] Run tests on every PR
  - [ ] Block merge if tests fail

**Success Criteria:**
- Test coverage >80% for core logic
- All tests pass on CI/CD
- E2E tests validate complete workflows
- Test fixtures enable reproducible testing

---

## PHASE 6: TESTING & POLISH (Days 17-20)
**Priority:** HIGH | **Estimated:** 4 days
**Rationale:** Ensure system works end-to-end before deployment

### Task 6.1: End-to-End Conversation Testing
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 6.1.1 Create test conversation scenarios
  - [ ] **Scenario 1:** Highly engaged, qualified lead (fast responses, clear budget, authority)
  - [ ] **Scenario 2:** Hesitant lead (slow responses, vague needs, low authority signals)
  - [ ] **Scenario 3:** Technical explorer (many questions, deep responses, no budget mention)
  - [ ] **Scenario 4:** Fast disqualification (no budget, no authority, no need)
  - [ ] **Scenario 5:** Cultural mismatch (wrong formality level, regional confusion)

- [ ] 6.1.2 Run scenarios through system
  - [ ] Simulate WhatsApp messages
  - [ ] Verify metrics calculated correctly
  - [ ] Check question selection makes sense
  - [ ] Validate message humanization
  - [ ] Ensure Spanish adaptation applies

- [ ] 6.1.3 Validate decision quality
  - [ ] Questions appropriate for conversation stage
  - [ ] Metric confidence increases over time
  - [ ] Thompson Sampling balances exploration/exploitation
  - [ ] Reasoning traces are clear and logical

- [ ] 6.1.4 Performance testing
  - [ ] Measure response time (<100ms for decision)
  - [ ] Test concurrent conversations (10+ simultaneous)
  - [ ] Check memory usage
  - [ ] Verify database query performance

**Success Criteria:**
- All 5 scenarios complete successfully
- Metrics accurate and stable
- Questions appropriate for context
- Messages natural and well-formatted
- Performance within targets (<100ms decisions)

---

### Task 6.2: Spanish Language Validation
**Priority:** HIGH | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 6.2.1 Test with real Spanish conversations
  - [ ] Spain Spanish (formal, direct)
  - [ ] Mexico Spanish (formal, relationship-oriented)
  - [ ] Colombia Spanish (warm, indirect)
  - [ ] Argentina Spanish (informal, unique vocabulary)

- [ ] 6.2.2 Validate spaCy accuracy
  - [ ] Entity extraction (companies, people, money, dates)
  - [ ] Sentiment analysis (positive, negative, neutral)
  - [ ] Formality detection (tú vs usted)

- [ ] 6.2.3 Check message quality
  - [ ] Greetings appropriate for time and region
  - [ ] Formality matches user's style
  - [ ] Vocabulary natural for region
  - [ ] No awkward machine-translated phrases

- [ ] 6.2.4 Test cultural adaptation
  - [ ] B2B etiquette followed
  - [ ] Relationship building before pricing questions
  - [ ] Regional holidays respected
  - [ ] Business hours check works

**Success Criteria:**
- spaCy NER accuracy >90% on Spanish B2B text
- Sentiment analysis matches human judgment in >85% of cases
- Formality detection >95% accurate
- Messages feel natural to native Spanish speakers

---

### Task 6.3: Metric Evolution System Testing
**Priority:** MEDIUM | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 6.3.1 Test anomaly detection
  - [ ] Create conversations with unexpected outcomes
  - [ ] Verify system flags them as anomalies
  - [ ] Check anomaly report clarity

- [ ] 6.3.2 Test gap analysis
  - [ ] Manually degrade a dimension (remove metrics)
  - [ ] Verify gap analysis identifies weakness
  - [ ] Check prioritization makes sense

- [ ] 6.3.3 Test AI metric suggestions
  - [ ] Run with various anomaly/gap contexts
  - [ ] Verify xAI suggests relevant metrics
  - [ ] Check suggestions are implementable

- [ ] 6.3.4 Test shadow mode
  - [ ] Add a proposed metric
  - [ ] Run shadow test on historical conversations
  - [ ] Verify test report is accurate
  - [ ] Check recommendation (approve/reject) is sound

- [ ] 6.3.5 Test approval workflow
  - [ ] Submit metric proposal
  - [ ] Review in UI
  - [ ] Approve metric
  - [ ] Verify metric activates correctly
  - [ ] Check versioning increments

**Success Criteria:**
- Anomaly detection finds edge cases
- Gap analysis identifies weak dimensions
- xAI suggestions are relevant and actionable
- Shadow tests accurately predict metric value
- Approval workflow smooth and fast

---

### Task 6.4: Self-Healing System Testing
**Priority:** MEDIUM | **Estimated:** 1 day (8 hours)

#### Subtasks:
- [ ] 6.4.1 Test error detection
  - [ ] Trigger various error types (crash, metric error, decision failure)
  - [ ] Verify errors captured with full context
  - [ ] Check classification accuracy

- [ ] 6.4.2 Test LLM diagnosis
  - [ ] Feed errors to xAI for diagnosis
  - [ ] Verify diagnosis identifies root cause in >80% of cases
  - [ ] Check diagnosis clarity

- [ ] 6.4.3 Test code fix generation
  - [ ] Generate fixes for common errors
  - [ ] Verify generated code is syntactically correct
  - [ ] Check fixes address root cause

- [ ] 6.4.4 Test automated testing of fixes
  - [ ] Apply fix to temporary branch
  - [ ] Run test suite
  - [ ] Verify bad fixes caught before deployment

- [ ] 6.4.5 Test GitHub automation
  - [ ] Create branch, commit, and PR
  - [ ] Verify PR includes complete context
  - [ ] Check human approval required

**Success Criteria:**
- Error detection captures all errors with context
- Diagnosis accuracy >80%
- Fix generation produces valid code in >90% of cases
- Automated testing catches bad fixes
- GitHub automation creates well-documented PRs

---

## 📊 SUCCESS METRICS

### Technical Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Decision Latency** | <100ms P95 | TBD | 🔄 Testing |
| **Test Coverage** | >80% | TBD | 🔄 Implementation |
| **Spanish NER Accuracy** | >90% | TBD | 🔄 Testing |
| **Formality Detection** | >95% | TBD | 🔄 Testing |
| **Message Humanization** | >7/10 user rating | TBD | 🔄 Testing |
| **Metric Self-Doc Completeness** | 100% (44/44 metrics) | TBD | 🔄 Implementation |
| **Shadow Test Accuracy** | >85% predictive power | TBD | 🔄 Testing |
| **Self-Healing Success Rate** | >70% fixes work | TBD | 🔄 Testing |

### Business Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Engagement Rate** | >70% first response | ~20% | ❌ Needs message humanization |
| **Conversation Completion** | >45% | ~10% | ❌ Needs message humanization |
| **Qualification Rate** | >40% of completed | TBD | 🔄 Testing |
| **Avg Messages to Qualify** | <15 | TBD | 🔄 Testing |
| **User Satisfaction** | >7/10 | ~3/10 | ❌ Needs Spanish adaptation |

### System Health

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| **Uptime** | >99.5% | TBD | 🔄 Monitoring |
| **Memory Footprint** | <10MB per conversation | TBD | 🔄 Testing |
| **Database Query Time** | <50ms P95 | TBD | 🔄 Optimization |
| **xAI API Success Rate** | >99% | TBD | 🔄 Monitoring |
| **Self-Healing PRs per Week** | <5 | TBD | 🔄 Monitoring |

---

## 🎯 EFFORT COMPARISON

### Pragmatic Architecture (This Plan)

```
Phase 0: Message Humanization                     = 2 days
Phase 1: Spanish Adaptation                       = 3 days
Phase 2: Explainability Enhancements              = 2 days
Phase 3: Dynamic Metric Evolution                 = 4 days
Phase 4: Self-Healing System                      = 3 days
Phase 5: Infrastructure & Documentation           = 2 days
Phase 6: Testing & Polish                         = 4 days
─────────────────────────────────────────────────────────
TOTAL                                             = 20 days
```

### Cognitive Stack Architecture (IMPLEMENTATION_TASKS.md)

```
Phase 0: GraphRAG + Evidence + MemGPT + ReAct    = 12 days
Phase 1: Infrastructure                           = 3 days
Phase 2: Core Functionality                       = 5 days
Phase 3: Self-Healing                             = 4 days
Phase 4: Optimization                             = 3 days
Phase 5: Deployment                               = 5 days
Buffer                                            = 5 days
─────────────────────────────────────────────────────────
TOTAL                                             = 37-40 days
```

**Time Savings: 17-20 days (46-50% reduction)**

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment
- [ ] All Phase 0-6 tasks completed
- [ ] Test coverage >80%
- [ ] All E2E tests passing
- [ ] Spanish language validation complete
- [ ] Performance benchmarks met
- [ ] Documentation complete

### Deployment
- [ ] .env file configured with production credentials
- [ ] Database migrations run
- [ ] Question bank seeded
- [ ] spaCy model downloaded
- [ ] xAI API key validated
- [ ] WhatsApp webhook configured
- [ ] GitHub token for self-healing set
- [ ] Admin email configured

### Post-Deployment
- [ ] Monitor error logs (first 24 hours)
- [ ] Check decision latency (should be <100ms)
- [ ] Verify WhatsApp messages flowing
- [ ] Test self-healing on first error
- [ ] Review metric evolution suggestions (first week)
- [ ] Collect user feedback
- [ ] Adjust Thompson Sampling parameters if needed

---

## 📝 NOTES

### Key Architectural Principles

1. **JSONB-First:** Store situation_awareness_state as structured JSON per instructions
2. **Lightweight ML:** Simple approximations, no transformers or embeddings
3. **Explainability-First:** Every decision has structured reasoning trace
4. **Thompson Sampling:** Proven exploration/exploitation for multi-armed bandits
5. **xAI Integration:** Use LLM for sophisticated reasoning, not as primary logic
6. **Self-Documenting:** Metrics and decisions explain themselves
7. **Pragmatic Simplicity:** No framework unless it provides measurable value

### Why This Approach Over "Cognitive Stack"

- ✅ Aligned with actual instruction requirements (lightweight, explainable, 5-30 messages)
- ✅ Builds on existing 65% complete implementation
- ✅ 50% faster to implement
- ✅ Lower operational complexity (PostgreSQL only, no Neo4j/Milvus required)
- ✅ Extensible design allows future enhancements if needed

### Technologies Selected

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Backend** | Express.js + TypeScript | Already implemented, good fit |
| **Database** | PostgreSQL + Drizzle | JSONB support, single service |
| **LLM** | xAI Grok + OpenAI | Already integrated, fast |
| **Spanish NLP** | spaCy es_core_news_lg | Fast, explainable, offline |
| **Frontend** | React + TypeScript | Already implemented |
| **Learning** | Thompson Sampling | Perfect for multi-armed bandit |
| **Caching** | Redis (optional) | Only if performance requires |

### Technologies Rejected

- ❌ Neo4j (overkill for 50-100 structured questions)
- ❌ Milvus/Weaviate (no need for semantic search over large corpora)
- ❌ LangGraph (too heavy for simple decision flow)
- ❌ MemGPT (conversations are 5-30 messages, not 100+)
- ❌ Microsoft GraphRAG (designed for large document knowledge bases)
- ❌ Ragas (not doing retrieval-augmented generation)
- ❌ Phoenix/Langfuse (enterprise observability - use simple logging first)

---

**END OF PRAGMATIC IMPLEMENTATION TASKS**