import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").default("admin"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  whatsappId: text("whatsapp_id").notNull().unique(),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone").notNull(),
  company: text("company"),
  status: text("status").default("active"), // active, paused, completed, qualified, disqualified
  language: text("language").default("es"),
  region: text("region").default("ES"),
  industryVertical: text("industry_vertical"),
  startedAt: timestamp("started_at").defaultNow(),
  lastActivity: timestamp("last_activity").defaultNow(),
  messageCount: integer("message_count").default(0),
  qualificationScore: real("qualification_score").default(0),
  metadata: jsonb("metadata").default({}),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  whatsappMessageId: text("whatsapp_message_id"),
  direction: text("direction").notNull(), // incoming, outgoing
  content: text("content").notNull(),
  messageType: text("message_type").default("text"), // text, image, document, etc.
  timestamp: timestamp("timestamp").defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const conversationMetrics = pgTable("conversation_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  version: text("version").default("1.0.0"),
  messageCount: integer("message_count").notNull(),
  
  // Engagement Dimension
  engagementScore: real("engagement_score").default(0),
  engagementConfidence: real("engagement_confidence").default(0),
  responseVelocity: real("response_velocity").default(0),
  messageDepthRatio: real("message_depth_ratio").default(0),
  questionRatio: real("question_ratio").default(0),
  turnTakingBalance: real("turn_taking_balance").default(0),
  dropOffRisk: real("drop_off_risk").default(0),
  
  // Qualification Dimension
  qualificationScore: real("qualification_score").default(0),
  qualificationConfidence: real("qualification_confidence").default(0),
  budgetSignalStrength: real("budget_signal_strength").default(0),
  budgetRangeMin: real("budget_range_min").default(0),
  budgetRangeMax: real("budget_range_max").default(0),
  budgetConfidenceLevel: real("budget_confidence_level").default(0),
  authorityScore: real("authority_score").default(0),
  authorityCertainty: real("authority_certainty").default(0),
  needIntensity: real("need_intensity").default(0),
  timelineUrgency: real("timeline_urgency").default(0),
  objectionRisk: real("objection_risk").default(0),
  
  // Technical Dimension
  technicalScore: real("technical_score").default(0),
  technicalConfidence: real("technical_confidence").default(0),
  sophisticationLevel: real("sophistication_level").default(0),
  projectScope: real("project_scope").default(0),
  scopeClarity: real("scope_clarity").default(0),
  organizationalMaturity: real("organizational_maturity").default(0),
  feasibilityBlockers: real("feasibility_blockers").default(0),
  
  // Emotional Dimension
  emotionalScore: real("emotional_score").default(0),
  emotionalConfidence: real("emotional_confidence").default(0),
  trustLevel: real("trust_level").default(0),
  frustrationLevel: real("frustration_level").default(0),
  enthusiasmLevel: real("enthusiasm_level").default(0),
  objectionTone: real("objection_tone").default(0),
  
  // Cultural Dimension (LATAM Sophistication)
  culturalScore: real("cultural_score").default(0),
  culturalConfidence: real("cultural_confidence").default(0),
  formalityIndex: real("formality_index").default(0), // usted/tuteo/voseo detection
  communicationStyle: text("communication_style"),
  businessCulture: text("business_culture"),
  codeSwitchingIndex: real("code_switching_index").default(0),
  negotiationPoliteness: real("negotiation_politeness").default(0),
  schedulingEtiquette: real("scheduling_etiquette").default(0),
  regionalMarkers: jsonb("regional_markers").default([]),
  
  // Meta Dimensions
  conversationHealthScore: real("conversation_health_score").default(0),
  flowScore: real("flow_score").default(0),
  coverageRatio: real("coverage_ratio").default(0),
  efficiencyScore: real("efficiency_score").default(0),
  
  systemConfidenceScore: real("system_confidence_score").default(0),
  explorationRate: real("exploration_rate").default(0.3),
  adaptationsMade: integer("adaptations_made").default(0),
  advancementEvents: integer("advancement_events").default(0),
  regretScore: real("regret_score").default(0),

  // Outcome/Value Dimensions
  qualificationOutcome: text("qualification_outcome"), // qualified, disqualified, pending
  expectedDealSize: real("expected_deal_size").default(0),
  dealSizeConfidence: real("deal_size_confidence").default(0),
  advanceProbability: real("advance_probability").default(0),
  expectedValue: real("expected_value").default(0), // P(advance) * budget
  valueConfidence: real("value_confidence").default(0),
  industrySegment: text("industry_segment"),
  regionSegment: text("region_segment"),
  
  // Full metric data as JSON
  fullMetrics: jsonb("full_metrics").default({}),
});

export const decisionTraces = pgTable("decision_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  action: text("action").notNull(),
  reasoning: text("reasoning").notNull(),
  metricsUsed: jsonb("metrics_used").default([]),
  confidence: real("confidence").default(0),
  explorationValue: real("exploration_value").default(0),
  utilityScore: real("utility_score").default(0),
  questionSelected: text("question_selected"),
  outcome: text("outcome"), // success, failure, pending
  feedback: jsonb("feedback").default({}),
});

export const questionBank = pgTable("question_bank", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(), // budget, technical, authority, need, etc.
  subcategory: text("subcategory"),
  questionText: text("question_text").notNull(),
  expectedResponses: jsonb("expected_responses").default([]),
  metrics: jsonb("metrics").default({}), // Which metrics this question helps improve
  language: text("language").default("es"),
  region: text("region").default("ES"),
  industryVertical: text("industry_vertical"),
  isActive: boolean("is_active").default(true),
  successRate: real("success_rate").default(0),
  usageCount: integer("usage_count").default(0),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const learningState = pgTable("learning_state", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id),
  metricName: text("metric_name").notNull(),
  currentValue: real("current_value").default(0),
  confidence: real("confidence").default(0),
  learningRate: real("learning_rate").default(0.3),
  explorationRate: real("exploration_rate").default(0.3),
  updateCount: integer("update_count").default(0),
  lastUpdated: timestamp("last_updated").defaultNow(),
  pattern: text("pattern"), // quick_qualifier, tech_explorer, relationship_builder
  patternConfidence: real("pattern_confidence").default(0),
});

// Reasoning Traces - Comprehensive audit trail for AI decision-making
export const reasoningTraces = pgTable("reasoning_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  turnId: varchar("turn_id").notNull(), // Links to specific conversation turn
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  decisionType: text("decision_type").notNull(), // question_selection, response_generation, qualification_assessment
  timestamp: timestamp("timestamp").defaultNow(),
  
  // Input data and features used for the decision
  features: jsonb("features").notNull(), // All input features used for decision
  
  // Decision candidates and selection
  candidates: jsonb("candidates").notNull(), // All options considered with scores
  chosen: jsonb("chosen").notNull(), // Selected option with detailed reasoning
  
  // Step-by-step reasoning chain from xAI
  reasoningChain: jsonb("reasoning_chain").notNull(), // Array of reasoning steps from xAI
  
  // Decision quality metrics
  confidence: real("confidence").notNull(), // Overall confidence in decision (0-1)
  policyVersion: text("policy_version").default("1.0.0"), // Version of decision policy used
  traceId: varchar("trace_id").notNull(), // Links related decisions in same turn
  processingTimeMs: integer("processing_time_ms").notNull(), // Time taken to generate reasoning
  
  // Additional context for human review
  businessJustification: text("business_justification"), // Why this decision helps business goals
  riskFactors: jsonb("risk_factors").default([]), // Identified risk factors
  alternativesConsidered: jsonb("alternatives_considered").default([]), // Other options evaluated
  
  // Quality and validation
  humanReviewed: boolean("human_reviewed").default(false),
  humanRating: integer("human_rating"), // 1-5 rating if reviewed
  humanFeedback: text("human_feedback"), // Human reviewer comments
  
  // Performance tracking
  apiLatencyMs: integer("api_latency_ms"), // xAI API response time
  tokensUsed: integer("tokens_used"), // Tokens consumed for reasoning
  model: text("model").default("grok-2-1212"), // xAI model used
});

// Relations
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
  metrics: many(conversationMetrics),
  decisionTraces: many(decisionTraces),
  learningStates: many(learningState),
  reasoningTraces: many(reasoningTraces),
}));

export const reasoningTracesRelations = relations(reasoningTraces, ({ one }) => ({
  conversation: one(conversations, {
    fields: [reasoningTraces.conversationId],
    references: [conversations.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const conversationMetricsRelations = relations(conversationMetrics, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMetrics.conversationId],
    references: [conversations.id],
  }),
}));

export const decisionTracesRelations = relations(decisionTraces, ({ one }) => ({
  conversation: one(conversations, {
    fields: [decisionTraces.conversationId],
    references: [conversations.id],
  }),
}));

export const learningStateRelations = relations(learningState, ({ one }) => ({
  conversation: one(conversations, {
    fields: [learningState.conversationId],
    references: [conversations.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  startedAt: true,
  lastActivity: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertConversationMetricsSchema = createInsertSchema(conversationMetrics).omit({
  id: true,
  timestamp: true,
});

export const insertDecisionTraceSchema = createInsertSchema(decisionTraces).omit({
  id: true,
  timestamp: true,
});

export const insertQuestionBankSchema = createInsertSchema(questionBank).omit({
  id: true,
  createdAt: true,
  lastUsed: true,
});

export const insertLearningStateSchema = createInsertSchema(learningState).omit({
  id: true,
  lastUpdated: true,
});

export const insertReasoningTraceSchema = createInsertSchema(reasoningTraces).omit({
  id: true,
  timestamp: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type ConversationMetrics = typeof conversationMetrics.$inferSelect;
export type InsertConversationMetrics = z.infer<typeof insertConversationMetricsSchema>;

export type DecisionTrace = typeof decisionTraces.$inferSelect;
export type InsertDecisionTrace = z.infer<typeof insertDecisionTraceSchema>;

export type QuestionBank = typeof questionBank.$inferSelect;
export type InsertQuestionBank = z.infer<typeof insertQuestionBankSchema>;

export type LearningState = typeof learningState.$inferSelect;
export type InsertLearningState = z.infer<typeof insertLearningStateSchema>;

export type ReasoningTrace = typeof reasoningTraces.$inferSelect;
export type InsertReasoningTrace = z.infer<typeof insertReasoningTraceSchema>;

// Replay Harness Tables
export const conversationRecordings = pgTable("conversation_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  recordingName: text("recording_name").notNull(),
  description: text("description"),
  status: text("status").default("active"), // active, archived, corrupted
  webhookEventCount: integer("webhook_event_count").default(0),
  lastWebhookAt: timestamp("last_webhook_at"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const webhookRecordings = pgTable("webhook_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordingId: varchar("recording_id").references(() => conversationRecordings.id).notNull(),
  traceId: varchar("trace_id").notNull(),
  sequenceNumber: integer("sequence_number").notNull(),
  webhookData: jsonb("webhook_data").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  processingStateHash: text("processing_state_hash").notNull(),
  
  // PII status for safe replay
  piiStatus: text("pii_status").default("raw"), // raw, scrubbed, anonymized
  scrubbedWebhookData: jsonb("scrubbed_webhook_data"),
});

export const executionTraces = pgTable("execution_traces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  traceId: varchar("trace_id").notNull(),
  webhookRecordingId: varchar("webhook_recording_id").references(() => webhookRecordings.id),
  stepName: text("step_name").notNull(), // webhook_parse, metrics_calc, decision_make, response_send, learning_update
  stepOrder: integer("step_order").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  
  // Input/Output tracking
  inputHash: text("input_hash").notNull(),
  outputHash: text("output_hash").notNull(),
  inputData: jsonb("input_data").notNull(),
  outputData: jsonb("output_data").notNull(),
  
  // Determinism tracking
  isReproducible: boolean("is_reproducible").default(true),
  executionTimeMs: integer("execution_time_ms"),
  
  // External API calls
  externalCalls: jsonb("external_calls").default([]),
  
  // Error information
  errorOccurred: boolean("error_occurred").default(false),
  errorMessage: text("error_message"),
  errorStack: text("error_stack"),
});

export const replayExecutions = pgTable("replay_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordingId: varchar("recording_id").references(() => conversationRecordings.id).notNull(),
  executionType: text("execution_type").notNull(), // full_replay, partial_replay, validation_check
  status: text("status").default("running"), // running, completed, failed, cancelled
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  
  // Reproducibility metrics
  totalSteps: integer("total_steps").default(0),
  reproducibleSteps: integer("reproducible_steps").default(0),
  reproducibilityRate: real("reproducibility_rate").default(0),
  
  // Hash validation
  originalHashes: jsonb("original_hashes").default({}),
  replayHashes: jsonb("replay_hashes").default({}),
  hashMismatches: jsonb("hash_mismatches").default([]),
  
  // Configuration
  replayConfig: jsonb("replay_config").default({}),
  
  // Results summary
  resultsSummary: jsonb("results_summary").default({}),
});

export const traceValidations = pgTable("trace_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  replayExecutionId: varchar("replay_execution_id").references(() => replayExecutions.id).notNull(),
  stepName: text("step_name").notNull(),
  validationType: text("validation_type").notNull(), // hash_match, output_equivalence, metric_consistency
  
  // Validation results
  isValid: boolean("is_valid").notNull(),
  confidence: real("confidence").default(1.0),
  
  // Comparison data
  originalValue: jsonb("original_value"),
  replayValue: jsonb("replay_value"),
  difference: jsonb("difference"),
  
  // Validation metadata
  validationTimestamp: timestamp("validation_timestamp").defaultNow(),
  validationMethod: text("validation_method"),
  notes: text("notes"),
});

// Relations for replay tables
export const conversationRecordingsRelations = relations(conversationRecordings, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [conversationRecordings.conversationId],
    references: [conversations.id],
  }),
  webhookRecordings: many(webhookRecordings),
  replayExecutions: many(replayExecutions),
}));

export const webhookRecordingsRelations = relations(webhookRecordings, ({ one, many }) => ({
  recording: one(conversationRecordings, {
    fields: [webhookRecordings.recordingId],
    references: [conversationRecordings.id],
  }),
  executionTraces: many(executionTraces),
}));

export const executionTracesRelations = relations(executionTraces, ({ one }) => ({
  webhookRecording: one(webhookRecordings, {
    fields: [executionTraces.webhookRecordingId],
    references: [webhookRecordings.id],
  }),
}));

export const replayExecutionsRelations = relations(replayExecutions, ({ one, many }) => ({
  recording: one(conversationRecordings, {
    fields: [replayExecutions.recordingId],
    references: [conversationRecordings.id],
  }),
  validations: many(traceValidations),
}));

export const traceValidationsRelations = relations(traceValidations, ({ one }) => ({
  replayExecution: one(replayExecutions, {
    fields: [traceValidations.replayExecutionId],
    references: [replayExecutions.id],
  }),
}));

// Insert schemas for replay tables
export const insertConversationRecordingSchema = createInsertSchema(conversationRecordings).omit({
  id: true,
  createdAt: true,
});

export const insertWebhookRecordingSchema = createInsertSchema(webhookRecordings).omit({
  id: true,
  timestamp: true,
});

export const insertExecutionTraceSchema = createInsertSchema(executionTraces).omit({
  id: true,
  timestamp: true,
});

export const insertReplayExecutionSchema = createInsertSchema(replayExecutions).omit({
  id: true,
  startedAt: true,
});

export const insertTraceValidationSchema = createInsertSchema(traceValidations).omit({
  id: true,
  validationTimestamp: true,
});

// Types for replay tables
export type ConversationRecording = typeof conversationRecordings.$inferSelect;
export type InsertConversationRecording = z.infer<typeof insertConversationRecordingSchema>;

export type WebhookRecording = typeof webhookRecordings.$inferSelect;
export type InsertWebhookRecording = z.infer<typeof insertWebhookRecordingSchema>;

export type ExecutionTrace = typeof executionTraces.$inferSelect;
export type InsertExecutionTrace = z.infer<typeof insertExecutionTraceSchema>;

export type ReplayExecution = typeof replayExecutions.$inferSelect;
export type InsertReplayExecution = z.infer<typeof insertReplayExecutionSchema>;

export type TraceValidation = typeof traceValidations.$inferSelect;
export type InsertTraceValidation = z.infer<typeof insertTraceValidationSchema>;

// Shadow A/B Testing Framework Tables
export const experiments = pgTable("experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  status: text("status").default("draft"), // draft, running, paused, completed, archived
  experimentType: text("experiment_type").notNull(), // decision_policy, learning_algorithm, cultural_context, budget_detection
  
  // Experiment configuration
  targetPopulation: jsonb("target_population").default({}), // conversation filters
  trafficAllocation: real("traffic_allocation").default(0.1), // percentage of traffic to shadow test
  minimumSampleSize: integer("minimum_sample_size").default(100),
  confidenceLevel: real("confidence_level").default(0.95),
  powerThreshold: real("power_threshold").default(0.8),
  
  // Duration and scheduling
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  plannedDuration: integer("planned_duration_days").default(30),
  
  // Statistical configuration
  primaryMetric: text("primary_metric").notNull(), // qualification_score, expected_value, conversion_rate
  secondaryMetrics: jsonb("secondary_metrics").default([]),
  minimumDetectableEffect: real("minimum_detectable_effect").default(0.05),
  
  // Safety configuration
  resourceLimits: jsonb("resource_limits").default({}),
  emergencyStopConditions: jsonb("emergency_stop_conditions").default([]),
  
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
  metadata: jsonb("metadata").default({}),
});

export const experimentVariants = pgTable("experiment_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  name: text("name").notNull(),
  isControl: boolean("is_control").default(false),
  allocation: real("allocation").default(0.5), // percentage of experiment traffic
  
  // Policy configuration
  policyType: text("policy_type").notNull(), // thompson_sampling, epsilon_greedy, cultural_adapted, budget_focused
  policyConfig: jsonb("policy_config").notNull(),
  
  // Learning algorithm configuration
  learningConfig: jsonb("learning_config").default({}),
  metricsWeights: jsonb("metrics_weights").default({}),
  explorationParams: jsonb("exploration_params").default({}),
  
  // Cultural context configuration
  culturalAdaptations: jsonb("cultural_adaptations").default({}),
  regionSpecificRules: jsonb("region_specific_rules").default({}),
  
  // Status and performance
  isActive: boolean("is_active").default(true),
  currentSampleSize: integer("current_sample_size").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
});

export const shadowDecisions = pgTable("shadow_decisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  productionDecisionId: varchar("production_decision_id").references(() => decisionTraces.id),
  
  timestamp: timestamp("timestamp").defaultNow(),
  decisionContext: jsonb("decision_context").notNull(),
  
  // Shadow decision details
  selectedAction: text("selected_action").notNull(),
  selectedQuestion: text("selected_question"),
  questionId: varchar("question_id").references(() => questionBank.id),
  confidence: real("confidence").default(0),
  utilityScore: real("utility_score").default(0),
  explorationValue: real("exploration_value").default(0),
  reasoning: text("reasoning").notNull(),
  
  // Policy-specific data
  policyScores: jsonb("policy_scores").default({}),
  learningState: jsonb("learning_state").default({}),
  culturalFactors: jsonb("cultural_factors").default({}),
  
  // Propensity scoring
  propensityScore: real("propensity_score").default(0),
  behaviourPolicy: jsonb("behaviour_policy").default({}),
  
  // Performance tracking
  executionTimeMs: integer("execution_time_ms"),
  resourceUsage: jsonb("resource_usage").default({}),
  errorOccurred: boolean("error_occurred").default(false),
  errorMessage: text("error_message"),
});

export const shadowMetrics = pgTable("shadow_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shadowDecisionId: varchar("shadow_decision_id").references(() => shadowDecisions.id).notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  messageCount: integer("message_count").notNull(),
  
  // Shadow metrics (mirroring conversationMetrics structure but for shadow decisions)
  shadowEngagementScore: real("shadow_engagement_score").default(0),
  shadowQualificationScore: real("shadow_qualification_score").default(0),
  shadowTechnicalScore: real("shadow_technical_score").default(0),
  shadowEmotionalScore: real("shadow_emotional_score").default(0),
  shadowCulturalScore: real("shadow_cultural_score").default(0),
  
  // Shadow-specific metrics
  shadowExpectedValue: real("shadow_expected_value").default(0),
  shadowAdvanceProbability: real("shadow_advance_probability").default(0),
  shadowRegretScore: real("shadow_regret_score").default(0),
  
  // Counterfactual analysis
  counterfactualScores: jsonb("counterfactual_scores").default({}),
  alternativeOutcomes: jsonb("alternative_outcomes").default([]),
  
  fullShadowMetrics: jsonb("full_shadow_metrics").default({}),
});

export const propensityScores = pgTable("propensity_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  
  // IPS calculation
  behaviourPolicyScore: real("behaviour_policy_score").notNull(), // P(action|context) under production policy
  evaluationPolicyScore: real("evaluation_policy_score").notNull(), // P(action|context) under shadow policy
  propensityScore: real("propensity_score").notNull(), // ratio for IPS weighting
  
  // Context features used for propensity calculation
  contextFeatures: jsonb("context_features").notNull(),
  actionTaken: text("action_taken").notNull(),
  
  // Model information
  propensityModel: text("propensity_model").default("logistic"), // logistic, neural_network, tree_based
  modelConfidence: real("model_confidence").default(0),
  
  // Validation
  isValidForIPS: boolean("is_valid_for_ips").default(true),
  validationNotes: text("validation_notes"),
});

export const regretAnalysis = pgTable("regret_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  shadowDecisionId: varchar("shadow_decision_id").references(() => shadowDecisions.id).notNull(),
  productionDecisionId: varchar("production_decision_id").references(() => decisionTraces.id),
  
  timestamp: timestamp("timestamp").defaultNow(),
  analysisWindow: integer("analysis_window_hours").default(24), // hours after decision to measure outcome
  
  // Outcome measurements
  productionOutcome: real("production_outcome").notNull(), // actual outcome from production decision
  shadowOutcome: real("shadow_outcome").notNull(), // estimated outcome from shadow decision
  outcomeMetric: text("outcome_metric").notNull(), // qualification_score, advance_probability, expected_value
  
  // Regret calculation
  instantaneousRegret: real("instantaneous_regret").notNull(), // shadow_outcome - production_outcome
  cumulativeRegret: real("cumulative_regret").default(0),
  normalizedRegret: real("normalized_regret").default(0), // regret / max_possible_outcome
  
  // Confidence and uncertainty
  outcomConfidence: real("outcome_confidence").default(0),
  regretVariance: real("regret_variance").default(0),
  
  // Context analysis
  decisionContext: jsonb("decision_context").notNull(),
  contextualFactors: jsonb("contextual_factors").default({}),
  
  // Attribution
  regretSource: text("regret_source"), // policy_choice, exploration_strategy, cultural_adaptation, timing
  contributingFactors: jsonb("contributing_factors").default([]),
});

export const experimentResults = pgTable("experiment_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").references(() => experiments.id).notNull(),
  variantId: varchar("variant_id").references(() => experimentVariants.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  analysisType: text("analysis_type").notNull(), // interim, final, post_hoc
  
  // Sample size and power
  sampleSize: integer("sample_size").notNull(),
  actualPower: real("actual_power").default(0),
  
  // Primary metric results
  primaryMetricValue: real("primary_metric_value").notNull(),
  primaryMetricVariance: real("primary_metric_variance").default(0),
  primaryMetricConfidenceInterval: jsonb("primary_metric_ci").default({}), // {lower: X, upper: Y}
  
  // Statistical significance
  pValue: real("p_value").default(1.0),
  effectSize: real("effect_size").default(0),
  isStatisticallySignificant: boolean("is_statistically_significant").default(false),
  
  // IPS-adjusted results
  ipsAdjustedValue: real("ips_adjusted_value").default(0),
  ipsVariance: real("ips_variance").default(0),
  ipsConfidenceInterval: jsonb("ips_confidence_interval").default({}),
  
  // Regret analysis summary
  avgRegret: real("avg_regret").default(0),
  maxRegret: real("max_regret").default(0),
  regretStdDev: real("regret_std_dev").default(0),
  cumulativeRegret: real("cumulative_regret").default(0),
  
  // Secondary metrics
  secondaryMetrics: jsonb("secondary_metrics").default({}),
  
  // Segmentation analysis
  segmentResults: jsonb("segment_results").default({}), // results by conversation stage, cultural context, etc.
  
  // Confidence and recommendations
  overallConfidence: real("overall_confidence").default(0),
  recommendation: text("recommendation"), // deploy, continue_testing, stop_experiment, needs_investigation
  recommendationReasoning: text("recommendation_reasoning"),
  
  // Analysis metadata
  analysisMethod: text("analysis_method").default("frequentist"), // frequentist, bayesian, bootstrap
  adjustmentsApplied: jsonb("adjustments_applied").default([]), // multiple_testing, bonferroni, fdr
});

// Relations for shadow testing tables
export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [experiments.createdBy],
    references: [users.id],
  }),
  variants: many(experimentVariants),
  shadowDecisions: many(shadowDecisions),
  results: many(experimentResults),
}));

export const experimentVariantsRelations = relations(experimentVariants, ({ one, many }) => ({
  experiment: one(experiments, {
    fields: [experimentVariants.experimentId],
    references: [experiments.id],
  }),
  shadowDecisions: many(shadowDecisions),
  shadowMetrics: many(shadowMetrics),
  results: many(experimentResults),
}));

export const shadowDecisionsRelations = relations(shadowDecisions, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [shadowDecisions.conversationId],
    references: [conversations.id],
  }),
  experiment: one(experiments, {
    fields: [shadowDecisions.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [shadowDecisions.variantId],
    references: [experimentVariants.id],
  }),
  productionDecision: one(decisionTraces, {
    fields: [shadowDecisions.productionDecisionId],
    references: [decisionTraces.id],
  }),
  question: one(questionBank, {
    fields: [shadowDecisions.questionId],
    references: [questionBank.id],
  }),
  shadowMetrics: many(shadowMetrics),
  regretAnalysis: many(regretAnalysis),
}));

export const shadowMetricsRelations = relations(shadowMetrics, ({ one }) => ({
  shadowDecision: one(shadowDecisions, {
    fields: [shadowMetrics.shadowDecisionId],
    references: [shadowDecisions.id],
  }),
  conversation: one(conversations, {
    fields: [shadowMetrics.conversationId],
    references: [conversations.id],
  }),
  experiment: one(experiments, {
    fields: [shadowMetrics.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [shadowMetrics.variantId],
    references: [experimentVariants.id],
  }),
}));

export const propensityScoresRelations = relations(propensityScores, ({ one }) => ({
  conversation: one(conversations, {
    fields: [propensityScores.conversationId],
    references: [conversations.id],
  }),
  experiment: one(experiments, {
    fields: [propensityScores.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [propensityScores.variantId],
    references: [experimentVariants.id],
  }),
}));

export const regretAnalysisRelations = relations(regretAnalysis, ({ one }) => ({
  conversation: one(conversations, {
    fields: [regretAnalysis.conversationId],
    references: [conversations.id],
  }),
  experiment: one(experiments, {
    fields: [regretAnalysis.experimentId],
    references: [experiments.id],
  }),
  shadowDecision: one(shadowDecisions, {
    fields: [regretAnalysis.shadowDecisionId],
    references: [shadowDecisions.id],
  }),
  productionDecision: one(decisionTraces, {
    fields: [regretAnalysis.productionDecisionId],
    references: [decisionTraces.id],
  }),
}));

export const experimentResultsRelations = relations(experimentResults, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentResults.experimentId],
    references: [experiments.id],
  }),
  variant: one(experimentVariants, {
    fields: [experimentResults.variantId],
    references: [experimentVariants.id],
  }),
}));

// Insert schemas for shadow testing tables
export const insertExperimentSchema = createInsertSchema(experiments).omit({
  id: true,
  createdAt: true,
});

export const insertExperimentVariantSchema = createInsertSchema(experimentVariants).omit({
  id: true,
  createdAt: true,
});

export const insertShadowDecisionSchema = createInsertSchema(shadowDecisions).omit({
  id: true,
  timestamp: true,
});

export const insertShadowMetricsSchema = createInsertSchema(shadowMetrics).omit({
  id: true,
  timestamp: true,
});

export const insertPropensityScoreSchema = createInsertSchema(propensityScores).omit({
  id: true,
  timestamp: true,
});

export const insertRegretAnalysisSchema = createInsertSchema(regretAnalysis).omit({
  id: true,
  timestamp: true,
});

export const insertExperimentResultSchema = createInsertSchema(experimentResults).omit({
  id: true,
  timestamp: true,
});

// Types for shadow testing tables
export type Experiment = typeof experiments.$inferSelect;
export type InsertExperiment = z.infer<typeof insertExperimentSchema>;

export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type InsertExperimentVariant = z.infer<typeof insertExperimentVariantSchema>;

export type ShadowDecision = typeof shadowDecisions.$inferSelect;
export type InsertShadowDecision = z.infer<typeof insertShadowDecisionSchema>;

export type ShadowMetrics = typeof shadowMetrics.$inferSelect;
export type InsertShadowMetrics = z.infer<typeof insertShadowMetricsSchema>;

export type PropensityScore = typeof propensityScores.$inferSelect;
export type InsertPropensityScore = z.infer<typeof insertPropensityScoreSchema>;

export type RegretAnalysis = typeof regretAnalysis.$inferSelect;
export type InsertRegretAnalysis = z.infer<typeof insertRegretAnalysisSchema>;

export type ExperimentResult = typeof experimentResults.$inferSelect;
export type InsertExperimentResult = z.infer<typeof insertExperimentResultSchema>;

// CRM Integration Tables

export const crmIntegrations = pgTable("crm_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  crmType: text("crm_type").notNull(), // salesforce, hubspot, pipedrive, custom
  isActive: boolean("is_active").default(true),
  
  // Authentication and configuration
  authConfig: jsonb("auth_config").notNull(), // OAuth tokens, API keys, etc.
  webhookUrl: text("webhook_url"),
  webhookSecret: text("webhook_secret"),
  
  // API configuration
  apiBaseUrl: text("api_base_url"),
  apiVersion: text("api_version"),
  rateLimits: jsonb("rate_limits").default({}),
  
  // Field mappings for different CRMs
  fieldMappings: jsonb("field_mappings").notNull(), // Map CRM fields to our schema
  stageMapping: jsonb("stage_mapping").notNull(), // Map CRM pipeline stages
  
  // Status and monitoring
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status").default("active"), // active, error, paused
  syncErrors: jsonb("sync_errors").default([]),
  
  // Performance tracking
  successfulWebhooks: integer("successful_webhooks").default(0),
  failedWebhooks: integer("failed_webhooks").default(0),
  avgResponseTime: real("avg_response_time").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata").default({}),
});

export const deals = pgTable("deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  crmIntegrationId: varchar("crm_integration_id").references(() => crmIntegrations.id).notNull(),
  
  // CRM identifiers
  crmDealId: text("crm_deal_id").notNull().unique(),
  crmContactId: text("crm_contact_id"),
  crmAccountId: text("crm_account_id"),
  
  // Deal basic information
  dealName: text("deal_name").notNull(),
  dealDescription: text("deal_description"),
  dealSource: text("deal_source").default("whatsapp_qualification"),
  
  // Pipeline and stage information
  pipelineStage: text("pipeline_stage").notNull(), // prospect, qualified, proposal, negotiation, closed_won, closed_lost
  previousStage: text("previous_stage"),
  stageHistory: jsonb("stage_history").default([]), // Array of stage transitions with timestamps
  
  // Financial information
  dealValue: real("deal_value").default(0), // Actual deal value in USD
  predictedValue: real("predicted_value").default(0), // AI-predicted value
  dealCurrency: text("deal_currency").default("USD"),
  probabilityToClose: real("probability_to_close").default(0), // CRM probability
  predictedProbability: real("predicted_probability").default(0), // AI-predicted probability
  
  // Timing information
  expectedCloseDate: timestamp("expected_close_date"),
  predictedCloseDate: timestamp("predicted_close_date"),
  actualCloseDate: timestamp("actual_close_date"),
  timeToClose: integer("time_to_close_days"), // Days from qualification to close
  
  // Outcome information
  dealOutcome: text("deal_outcome"), // won, lost, cancelled, pending
  lossReason: text("loss_reason"),
  lossCategory: text("loss_category"), // price, competitor, timing, fit, other
  winReason: text("win_reason"),
  
  // Attribution to AI system
  qualificationSource: text("qualification_source").default("ai"), // ai, manual, hybrid
  qualificationAccuracy: real("qualification_accuracy"), // How accurate was the AI prediction
  qualificationConfidence: real("qualification_confidence"), // AI confidence at qualification
  
  // Business context
  industry: text("industry"),
  companySize: text("company_size"),
  region: text("region").default("LATAM"),
  language: text("language").default("es"),
  
  // Performance tracking
  engagementQuality: real("engagement_quality"), // From conversation metrics
  responseTime: real("response_time"), // Time to first response
  touchpointCount: integer("touchpoint_count").default(0),
  
  // Status and tracking
  isActive: boolean("is_active").default(true),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  
  // Full context preservation
  qualificationMetrics: jsonb("qualification_metrics"), // Metrics at time of qualification
  conversationSummary: text("conversation_summary"),
  metadata: jsonb("metadata").default({}),
});

export const dealOutcomes = pgTable("deal_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id").references(() => deals.id).notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  outcomeType: text("outcome_type").notNull(), // stage_progression, deal_closed, deal_lost, revenue_realized
  
  // Outcome measurements
  actualValue: real("actual_value"), // Actual business value
  predictedValue: real("predicted_value"), // What AI predicted
  predictionAccuracy: real("prediction_accuracy"), // |actual - predicted| / predicted
  predictionError: real("prediction_error"), // actual - predicted
  
  // Timing accuracy
  actualTimeToClose: integer("actual_time_to_close_days"),
  predictedTimeToClose: integer("predicted_time_to_close_days"),
  timingAccuracy: real("timing_accuracy"),
  
  // Qualification validation
  qualificationScore: real("qualification_score"), // Original AI qualification score
  qualificationValidated: boolean("qualification_validated"), // Did the outcome validate qualification?
  qualificationAccuracy: real("qualification_accuracy"), // How accurate was qualification
  
  // Budget validation
  originalBudgetPrediction: real("original_budget_prediction"),
  actualBudget: real("actual_budget"),
  budgetAccuracy: real("budget_accuracy"),
  budgetConfidence: real("budget_confidence"),
  
  // Cultural context validation
  culturalScore: real("cultural_score"), // Original cultural adaptation score
  culturalEffectiveness: real("cultural_effectiveness"), // Did cultural adaptation help?
  communicationStyle: text("communication_style"),
  culturalFactors: jsonb("cultural_factors").default({}),
  
  // Decision validation
  decisionQuality: real("decision_quality"), // How good were the AI decisions?
  questionEffectiveness: real("question_effectiveness"), // Did selected questions help?
  conversationFlow: real("conversation_flow"), // Was conversation flow optimal?
  
  // Context and attribution
  outcomeContext: jsonb("outcome_context").notNull(),
  contributingFactors: jsonb("contributing_factors").default([]),
  externalFactors: jsonb("external_factors").default([]), // Market conditions, etc.
  
  // Validation metadata
  validatedBy: text("validated_by"), // human, system, crm_webhook
  validationConfidence: real("validation_confidence").default(1.0),
  validationNotes: text("validation_notes"),
});

export const outcomeValidations = pgTable("outcome_validations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealOutcomeId: varchar("deal_outcome_id").references(() => dealOutcomes.id).notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  validationType: text("validation_type").notNull(), // prediction_accuracy, qualification_validation, timing_validation, budget_validation
  
  // Validation results
  isValid: boolean("is_valid").notNull(),
  confidenceScore: real("confidence_score").default(0),
  validationMethod: text("validation_method").notNull(), // statistical, threshold_based, ml_model, human_review
  
  // Metrics comparison
  originalMetrics: jsonb("original_metrics").notNull(), // Metrics at time of prediction
  outcomeMetrics: jsonb("outcome_metrics").notNull(), // Actual outcome measurements
  deviationAnalysis: jsonb("deviation_analysis").default({}),
  
  // Statistical validation
  statisticalSignificance: real("statistical_significance"),
  errorBounds: jsonb("error_bounds").default({}), // confidence intervals
  outlierDetection: boolean("outlier_detection").default(false),
  
  // Correlation analysis
  correlationStrength: real("correlation_strength"), // Between prediction and outcome
  correlationFactors: jsonb("correlation_factors").default([]),
  
  // Learning insights
  learningInsights: jsonb("learning_insights").default([]),
  improvementAreas: jsonb("improvement_areas").default([]),
  calibrationNeeds: jsonb("calibration_needs").default([]),
  
  // Validation context
  validationContext: jsonb("validation_context").default({}),
  qualityScore: real("quality_score").default(0),
  notes: text("notes"),
});

export const calibrationUpdates = pgTable("calibration_updates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  outcomeValidationId: varchar("outcome_validation_id").references(() => outcomeValidations.id).notNull(),
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  dealId: varchar("deal_id").references(() => deals.id).notNull(),
  
  timestamp: timestamp("timestamp").defaultNow(),
  calibrationType: text("calibration_type").notNull(), // learning_rate, confidence_threshold, thompson_sampling, cultural_weights
  
  // Learning algorithm updates
  metricName: text("metric_name").notNull(),
  previousValue: real("previous_value").notNull(),
  updatedValue: real("updated_value").notNull(),
  learningRateUsed: real("learning_rate_used").default(0),
  
  // Thompson sampling updates
  priorAlpha: real("prior_alpha"), // Beta distribution parameters
  priorBeta: real("prior_beta"),
  posteriorAlpha: real("posterior_alpha"),
  posteriorBeta: real("posterior_beta"),
  
  // Confidence calibration
  previousConfidence: real("previous_confidence"),
  updatedConfidence: real("updated_confidence"),
  confidenceCalibrationError: real("confidence_calibration_error"),
  
  // Cultural model updates
  culturalWeights: jsonb("cultural_weights").default({}),
  regionalAdjustments: jsonb("regional_adjustments").default({}),
  languageAdjustments: jsonb("language_adjustments").default({}),
  
  // Effectiveness measurement
  calibrationImpact: real("calibration_impact"), // Expected improvement from update
  validationScore: real("validation_score"), // How well this calibration worked
  appliedToConversations: integer("applied_to_conversations").default(0),
  
  // Update context
  updateContext: jsonb("update_context").notNull(),
  updateReason: text("update_reason").notNull(),
  updateMethod: text("update_method").default("automated"), // automated, manual, hybrid
  
  // Status tracking
  isApplied: boolean("is_applied").default(false),
  applicationResults: jsonb("application_results").default({}),
  rollbackAvailable: boolean("rollback_available").default(true),
  
  notes: text("notes"),
});

export const dealAnalytics = pgTable("deal_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Time window for analytics
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  analysisType: text("analysis_type").notNull(), // daily, weekly, monthly, quarterly, on_demand
  
  // Overall performance metrics
  totalDeals: integer("total_deals").default(0),
  dealsWon: integer("deals_won").default(0),
  dealsLost: integer("deals_lost").default(0),
  dealsPending: integer("deals_pending").default(0),
  
  // Financial metrics
  totalRevenue: real("total_revenue").default(0),
  averageDealSize: real("average_deal_size").default(0),
  totalPredictedRevenue: real("total_predicted_revenue").default(0),
  revenueAccuracy: real("revenue_accuracy").default(0),
  
  // Conversion metrics
  qualificationConversionRate: real("qualification_conversion_rate").default(0),
  proposalConversionRate: real("proposal_conversion_rate").default(0),
  overallConversionRate: real("overall_conversion_rate").default(0),
  
  // AI performance metrics
  qualificationAccuracy: real("qualification_accuracy").default(0),
  predictionAccuracy: real("prediction_accuracy").default(0),
  timingAccuracy: real("timing_accuracy").default(0),
  budgetAccuracy: real("budget_accuracy").default(0),
  
  // Cultural effectiveness
  culturalEffectiveness: real("cultural_effectiveness").default(0),
  regionalPerformance: jsonb("regional_performance").default({}),
  languagePerformance: jsonb("language_performance").default({}),
  
  // Time metrics
  averageTimeToClose: real("average_time_to_close_days").default(0),
  averageResponseTime: real("average_response_time_hours").default(0),
  averageCycleTime: real("average_cycle_time_days").default(0),
  
  // ROI and efficiency
  aiRoi: real("ai_roi").default(0), // Return on AI investment
  costPerQualifiedLead: real("cost_per_qualified_lead").default(0),
  costPerClosedDeal: real("cost_per_closed_deal").default(0),
  
  // Quality metrics
  conversationQuality: real("conversation_quality").default(0),
  engagementQuality: real("engagement_quality").default(0),
  leadQuality: real("lead_quality").default(0),
  
  // Segmentation analysis
  industryPerformance: jsonb("industry_performance").default({}),
  companySizePerformance: jsonb("company_size_performance").default({}),
  sourcePerformance: jsonb("source_performance").default({}),
  
  // Calibration effectiveness
  calibrationImpact: real("calibration_impact").default(0),
  learningEffectiveness: real("learning_effectiveness").default(0),
  
  // Analysis metadata
  timestamp: timestamp("timestamp").defaultNow(),
  analyzedBy: text("analyzed_by").default("system"),
  analysisVersion: text("analysis_version").default("1.0.0"),
  confidence: real("confidence").default(0),
  notes: text("notes"),
});

// Knowledge Graph Tables for self-improving conversation intelligence

// Knowledge Graph Nodes - Entities extracted from conversations
export const knowledgeGraphNodes = pgTable("knowledge_graph_nodes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").notNull().unique(), // Canonical entity identifier
  entityType: text("entity_type").notNull(), // company, person, technology, pain_point, solution, industry, region
  entityName: text("entity_name").notNull(),
  canonicalName: text("canonical_name").notNull(), // Normalized name for deduplication
  
  // Entity attributes stored as JSON for flexibility
  attributes: jsonb("attributes").default({}), // size, industry, budget_range, title, tech_stack, etc.
  
  // Confidence and quality scores
  confidence: real("confidence").default(0), // 0-1 confidence in entity extraction
  qualityScore: real("quality_score").default(0), // 0-1 based on validation and consistency
  
  // Source information
  firstMentionedIn: varchar("first_mentioned_in"), // conversationId where first extracted
  lastUpdatedFrom: varchar("last_updated_from"), // conversationId of most recent update
  extractionCount: integer("extraction_count").default(1), // How many times extracted
  
  // Validation status
  validationStatus: text("validation_status").default("pending"), // pending, validated, invalidated, manual_review
  humanValidated: boolean("human_validated").default(false),
  humanValidatedBy: text("human_validated_by"),
  humanValidatedAt: timestamp("human_validated_at"),
  
  // LATAM specific attributes
  culturalMarkers: jsonb("cultural_markers").default([]), // formality, communication style, etc.
  regionalIndicators: jsonb("regional_indicators").default([]), // country, dialect markers
  
  // Timestamps
  firstExtracted: timestamp("first_extracted").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  
  // Versioning
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
});

// Knowledge Graph Edges - Relationships between entities
export const knowledgeGraphEdges = pgTable("knowledge_graph_edges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  edgeId: varchar("edge_id").notNull().unique(), // Canonical edge identifier
  
  // Relationship definition
  sourceEntityId: varchar("source_entity_id").references(() => knowledgeGraphNodes.entityId).notNull(),
  targetEntityId: varchar("target_entity_id").references(() => knowledgeGraphNodes.entityId).notNull(),
  relationshipType: text("relationship_type").notNull(), // works_at, uses_technology, has_budget, needs_solution, competing_with
  
  // Relationship attributes
  relationshipAttributes: jsonb("relationship_attributes").default({}), // start_date, confidence_level, urgency, etc.
  
  // Strength and confidence
  strength: real("strength").default(0.5), // 0-1 strength of relationship
  confidence: real("confidence").default(0), // 0-1 confidence in relationship
  
  // Outcome correlation
  successCorrelation: real("success_correlation").default(0), // Correlation with successful conversations (-1 to 1)
  outcomeCount: jsonb("outcome_count").default({}), // {qualified: 5, disqualified: 2, pending: 1}
  
  // Source tracking
  extractedFrom: jsonb("extracted_from").default([]), // Array of conversationIds where this was observed
  firstObserved: varchar("first_observed"), // conversationId where first seen
  lastObserved: varchar("last_observed"), // conversationId where most recently seen
  observationCount: integer("observation_count").default(1),
  
  // Validation
  validationStatus: text("validation_status").default("pending"),
  humanValidated: boolean("human_validated").default(false),
  
  // Timestamps
  firstExtracted: timestamp("first_extracted").defaultNow(),
  lastUpdated: timestamp("last_updated").defaultNow(),
  
  // Versioning
  version: integer("version").default(1),
  isActive: boolean("is_active").default(true),
});

// Knowledge Graph Versions - For rollback and debugging
export const knowledgeGraphVersions = pgTable("knowledge_graph_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  versionId: varchar("version_id").notNull().unique(),
  
  // Version metadata
  versionNumber: integer("version_number").notNull(),
  description: text("description"), // Human readable description of changes
  triggerEvent: text("trigger_event"), // conversation_complete, manual_update, batch_learning
  triggerConversationId: varchar("trigger_conversation_id"),
  
  // Graph snapshot (compressed JSON)
  nodesSnapshot: jsonb("nodes_snapshot").notNull(), // Complete nodes at this version
  edgesSnapshot: jsonb("edges_snapshot").notNull(), // Complete edges at this version
  
  // Statistics
  nodeCount: integer("node_count").default(0),
  edgeCount: integer("edge_count").default(0),
  qualityScore: real("quality_score").default(0), // Overall graph quality at this version
  
  // Change tracking
  changesFromPrevious: jsonb("changes_from_previous").default({}), // nodes_added, nodes_removed, edges_added, etc.
  
  // Metadata
  createdBy: text("created_by").default("system"), // system, admin, batch_process
  createdAt: timestamp("created_at").defaultNow(),
  
  // Rollback information
  isCurrentVersion: boolean("is_current_version").default(false),
  rolledBackFrom: varchar("rolled_back_from"), // Reference to version this was rolled back from
});

// Knowledge Extractions - Quality tracking and validation
export const knowledgeExtractions = pgTable("knowledge_extractions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Source information
  conversationId: varchar("conversation_id").references(() => conversations.id).notNull(),
  messageId: varchar("message_id"), // Specific message if applicable
  extractionBatch: varchar("extraction_batch"), // For batch processing identification
  
  // Extraction details
  extractorType: text("extractor_type").default("xai_grok"), // xai_grok, manual, batch_nlp
  extractorVersion: text("extractor_version").default("1.0.0"),
  
  // What was extracted
  entitiesExtracted: jsonb("entities_extracted").default([]), // Array of entity objects
  relationshipsExtracted: jsonb("relationships_extracted").default([]), // Array of relationship objects
  
  // Quality metrics
  extractionConfidence: real("extraction_confidence").default(0), // 0-1 overall confidence
  entityAccuracy: real("entity_accuracy").default(0), // Measured against validation
  relationshipAccuracy: real("relationship_accuracy").default(0),
  
  // Validation results
  humanReviewed: boolean("human_reviewed").default(false),
  humanReviewedBy: text("human_reviewed_by"),
  humanReviewedAt: timestamp("human_reviewed_at"),
  humanRating: integer("human_rating"), // 1-5 quality rating
  humanFeedback: text("human_feedback"),
  
  // Quality flags
  lowConfidenceFlags: jsonb("low_confidence_flags").default([]), // Specific quality issues
  validationErrors: jsonb("validation_errors").default([]), // Validation failures
  pollutionRisk: real("pollution_risk").default(0), // Risk of degrading graph quality
  
  // Performance tracking
  processingTimeMs: integer("processing_time_ms"),
  tokensUsed: integer("tokens_used"),
  apiLatencyMs: integer("api_latency_ms"),
  
  // Status
  status: text("status").default("pending"), // pending, approved, rejected, needs_review
  rejectionReason: text("rejection_reason"),
  
  timestamp: timestamp("timestamp").defaultNow(),
});

// Graph Analytics - Metrics and insights derived from the knowledge graph
export const graphAnalytics = pgTable("graph_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Analysis scope
  analysisType: text("analysis_type").notNull(), // daily, weekly, conversation_complete, on_demand
  analysisScope: text("analysis_scope").default("global"), // global, industry, region, company_size
  scopeFilter: jsonb("scope_filter").default({}), // Filters applied for scoped analysis
  
  // Graph structure metrics
  totalNodes: integer("total_nodes").default(0),
  totalEdges: integer("total_edges").default(0),
  nodesByType: jsonb("nodes_by_type").default({}), // {company: 150, person: 200, technology: 75}
  edgesByType: jsonb("edges_by_type").default({}),
  
  // Network analysis metrics
  averageDegree: real("average_degree").default(0),
  maxDegree: integer("max_degree").default(0),
  clusteringCoefficient: real("clustering_coefficient").default(0),
  connectedComponents: integer("connected_components").default(0),
  graphDensity: real("graph_density").default(0),
  
  // Centrality metrics
  topNodesByCentrality: jsonb("top_nodes_by_centrality").default({}), // {betweenness: [], closeness: [], eigenvector: []}
  centralityDistribution: jsonb("centrality_distribution").default({}),
  
  // Success pattern analysis
  successfulPatterns: jsonb("successful_patterns").default([]), // Patterns correlated with success
  failurePatterns: jsonb("failure_patterns").default([]), // Patterns correlated with failure
  emergingPatterns: jsonb("emerging_patterns").default([]), // New patterns detected
  
  // Quality metrics
  overallQuality: real("overall_quality").default(0), // 0-1 graph quality score
  dataFreshness: real("data_freshness").default(0), // How recent the data is
  completenessScore: real("completeness_score").default(0), // How complete entity profiles are
  
  // Performance impact
  queryPerformance: jsonb("query_performance").default({}), // Response times for common queries
  predictionAccuracy: real("prediction_accuracy").default(0), // How well graph predictions perform
  
  // Growth metrics
  nodesAdded: integer("nodes_added").default(0), // Since last analysis
  edgesAdded: integer("edges_added").default(0),
  qualityImprovement: real("quality_improvement").default(0),
  
  // Analysis metadata
  timestamp: timestamp("timestamp").defaultNow(),
  analysisVersion: text("analysis_version").default("1.0.0"),
  computationTimeMs: integer("computation_time_ms"),
  memoryUsedMb: real("memory_used_mb"),
});

// Relations for CRM integration tables
export const crmIntegrationsRelations = relations(crmIntegrations, ({ many }) => ({
  deals: many(deals),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [deals.conversationId],
    references: [conversations.id],
  }),
  crmIntegration: one(crmIntegrations, {
    fields: [deals.crmIntegrationId],
    references: [crmIntegrations.id],
  }),
  outcomes: many(dealOutcomes),
  calibrationUpdates: many(calibrationUpdates),
}));

export const dealOutcomesRelations = relations(dealOutcomes, ({ one, many }) => ({
  deal: one(deals, {
    fields: [dealOutcomes.dealId],
    references: [deals.id],
  }),
  conversation: one(conversations, {
    fields: [dealOutcomes.conversationId],
    references: [conversations.id],
  }),
  validations: many(outcomeValidations),
}));

export const outcomeValidationsRelations = relations(outcomeValidations, ({ one, many }) => ({
  dealOutcome: one(dealOutcomes, {
    fields: [outcomeValidations.dealOutcomeId],
    references: [dealOutcomes.id],
  }),
  conversation: one(conversations, {
    fields: [outcomeValidations.conversationId],
    references: [conversations.id],
  }),
  calibrationUpdates: many(calibrationUpdates),
}));

export const calibrationUpdatesRelations = relations(calibrationUpdates, ({ one }) => ({
  outcomeValidation: one(outcomeValidations, {
    fields: [calibrationUpdates.outcomeValidationId],
    references: [outcomeValidations.id],
  }),
  conversation: one(conversations, {
    fields: [calibrationUpdates.conversationId],
    references: [conversations.id],
  }),
  deal: one(deals, {
    fields: [calibrationUpdates.dealId],
    references: [deals.id],
  }),
}));

// Insert schemas for CRM integration tables
export const insertCrmIntegrationSchema = createInsertSchema(crmIntegrations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDealSchema = createInsertSchema(deals).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertDealOutcomeSchema = createInsertSchema(dealOutcomes).omit({
  id: true,
  timestamp: true,
});

export const insertOutcomeValidationSchema = createInsertSchema(outcomeValidations).omit({
  id: true,
  timestamp: true,
});

export const insertCalibrationUpdateSchema = createInsertSchema(calibrationUpdates).omit({
  id: true,
  timestamp: true,
});

export const insertDealAnalyticsSchema = createInsertSchema(dealAnalytics).omit({
  id: true,
  timestamp: true,
});

// Types for CRM integration tables
export type CrmIntegration = typeof crmIntegrations.$inferSelect;
export type InsertCrmIntegration = z.infer<typeof insertCrmIntegrationSchema>;

export type Deal = typeof deals.$inferSelect;
export type InsertDeal = z.infer<typeof insertDealSchema>;

export type DealOutcome = typeof dealOutcomes.$inferSelect;
export type InsertDealOutcome = z.infer<typeof insertDealOutcomeSchema>;

export type OutcomeValidation = typeof outcomeValidations.$inferSelect;
export type InsertOutcomeValidation = z.infer<typeof insertOutcomeValidationSchema>;

export type CalibrationUpdate = typeof calibrationUpdates.$inferSelect;
export type InsertCalibrationUpdate = z.infer<typeof insertCalibrationUpdateSchema>;

export type DealAnalytics = typeof dealAnalytics.$inferSelect;
export type InsertDealAnalytics = z.infer<typeof insertDealAnalyticsSchema>;

// Metric structure types
export interface MetricGroup {
  [key: string]: number;
}

export interface Dimension {
  score: number;
  confidence: number;
  groups: Record<string, MetricGroup>;
}

export interface SituationAwarenessState {
  version: string;
  conversationId: string;
  timestamp: string;
  messageCount: number;
  dimensions: {
    engagement: Dimension;
    qualification: Dimension;
    technical: Dimension;
    emotional: Dimension;
    cultural: Dimension;
  };
  meta: {
    conversationHealth: Dimension;
    systemConfidence: Dimension;
    learningState: {
      explorationRate: number;
      confidenceThreshold: number;
      adaptationsMade: number;
    };
    decisionTrace: Array<{
      timestamp: string;
      action: string;
      reasoning: string;
      metricsUsed: string[];
    }>;
  };
}

// Knowledge Graph Relations
export const knowledgeGraphNodesRelations = relations(knowledgeGraphNodes, ({ many, one }) => ({
  outgoingEdges: many(knowledgeGraphEdges, { relationName: "sourceEntity" }),
  incomingEdges: many(knowledgeGraphEdges, { relationName: "targetEntity" }),
  extractions: many(knowledgeExtractions),
  firstMentionedConversation: one(conversations, {
    fields: [knowledgeGraphNodes.firstMentionedIn],
    references: [conversations.id],
  }),
  lastUpdatedConversation: one(conversations, {
    fields: [knowledgeGraphNodes.lastUpdatedFrom],
    references: [conversations.id],
  }),
}));

export const knowledgeGraphEdgesRelations = relations(knowledgeGraphEdges, ({ one, many }) => ({
  sourceEntity: one(knowledgeGraphNodes, {
    fields: [knowledgeGraphEdges.sourceEntityId],
    references: [knowledgeGraphNodes.entityId],
    relationName: "sourceEntity",
  }),
  targetEntity: one(knowledgeGraphNodes, {
    fields: [knowledgeGraphEdges.targetEntityId],
    references: [knowledgeGraphNodes.entityId],
    relationName: "targetEntity",
  }),
  firstObservedConversation: one(conversations, {
    fields: [knowledgeGraphEdges.firstObserved],
    references: [conversations.id],
  }),
  lastObservedConversation: one(conversations, {
    fields: [knowledgeGraphEdges.lastObserved],
    references: [conversations.id],
  }),
}));

export const knowledgeGraphVersionsRelations = relations(knowledgeGraphVersions, ({ one }) => ({
  triggerConversation: one(conversations, {
    fields: [knowledgeGraphVersions.triggerConversationId],
    references: [conversations.id],
  }),
}));

export const knowledgeExtractionsRelations = relations(knowledgeExtractions, ({ one }) => ({
  conversation: one(conversations, {
    fields: [knowledgeExtractions.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, {
    fields: [knowledgeExtractions.messageId],
    references: [messages.id],
  }),
}));

// Knowledge Graph Insert Schemas
export const insertKnowledgeGraphNodeSchema = createInsertSchema(knowledgeGraphNodes).omit({
  id: true,
  firstExtracted: true,
  lastUpdated: true,
  version: true,
});

export const insertKnowledgeGraphEdgeSchema = createInsertSchema(knowledgeGraphEdges).omit({
  id: true,
  firstExtracted: true,
  lastUpdated: true,
  version: true,
});

export const insertKnowledgeGraphVersionSchema = createInsertSchema(knowledgeGraphVersions).omit({
  id: true,
  createdAt: true,
});

export const insertKnowledgeExtractionSchema = createInsertSchema(knowledgeExtractions).omit({
  id: true,
  timestamp: true,
});

export const insertGraphAnalyticsSchema = createInsertSchema(graphAnalytics).omit({
  id: true,
  timestamp: true,
});

// Knowledge Graph Types
export type KnowledgeGraphNode = typeof knowledgeGraphNodes.$inferSelect;
export type InsertKnowledgeGraphNode = z.infer<typeof insertKnowledgeGraphNodeSchema>;

export type KnowledgeGraphEdge = typeof knowledgeGraphEdges.$inferSelect;
export type InsertKnowledgeGraphEdge = z.infer<typeof insertKnowledgeGraphEdgeSchema>;

export type KnowledgeGraphVersion = typeof knowledgeGraphVersions.$inferSelect;
export type InsertKnowledgeGraphVersion = z.infer<typeof insertKnowledgeGraphVersionSchema>;

export type KnowledgeExtraction = typeof knowledgeExtractions.$inferSelect;
export type InsertKnowledgeExtraction = z.infer<typeof insertKnowledgeExtractionSchema>;

export type GraphAnalytics = typeof graphAnalytics.$inferSelect;
export type InsertGraphAnalytics = z.infer<typeof insertGraphAnalyticsSchema>;

// Knowledge Graph Entity Types
export interface EntityAttributes {
  // Company attributes
  companySize?: number;
  industry?: string;
  budgetRange?: { min: number; max: number };
  techStack?: string[];
  employeeCount?: number;
  revenue?: number;
  
  // Person attributes
  title?: string;
  seniority?: string;
  department?: string;
  decisionMaker?: boolean;
  budget_authority?: boolean;
  
  // Technology attributes
  category?: string;
  complexity?: number;
  implementation_cost?: number;
  
  // Pain point attributes
  severity?: number;
  urgency?: number;
  impact?: string;
  
  // Solution attributes
  solutionType?: string;
  cost?: number;
  timeline?: string;
  
  // LATAM specific
  region?: string;
  country?: string;
  language?: string;
  cultural_markers?: string[];
}

// Knowledge Graph Query Interfaces
export interface SimilarCompanyQuery {
  entityId: string;
  similarityThreshold: number;
  outcomeFilter?: string[];
  industryFilter?: string[];
  sizeFilter?: { min?: number; max?: number };
  limit?: number;
}

export interface SuccessPatternQuery {
  industry?: string;
  companySize?: number;
  region?: string;
  outcomeType: string;
  confidenceThreshold?: number;
  limit?: number;
}

export interface EntityInsightQuery {
  entityId: string;
  includeRelationships: boolean;
  includeSuccessMetrics: boolean;
  timeRange?: { start: Date; end: Date };
}
