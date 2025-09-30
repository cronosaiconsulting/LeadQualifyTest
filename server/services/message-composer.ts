// MessageComposer - Transforms raw questions into natural B2B conversations
// Implements greeting, acknowledgment, transition, and contextual wrapping
// Supports Spanish B2B cultural norms and regional variations

import type {
  Conversation,
  Message,
  ConversationMetrics,
  QuestionBank
} from "@shared/schema";
import { storage } from "../storage";
import { grokNLPService } from "./grok-nlp";

// Conversation phases for state machine
export type ConversationPhase =
  | 'greeting'       // Initial contact, introduction
  | 'exploration'    // Building rapport, understanding needs
  | 'qualification'  // Direct qualification questions (budget, authority, timeline)
  | 'deepening'      // Technical details, scope clarification
  | 'closing';       // Summary, next steps

export interface MessageContext {
  conversationId: string;
  phase: ConversationPhase;
  messageCount: number;
  lastUserMessage?: string;
  lastUserSentiment?: 'positive' | 'negative' | 'neutral';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isFirstMessage: boolean;
  isReturningUser: boolean;
  userFormality?: 'formal' | 'informal';
  region: string;
  previousTopic?: string;
  nextTopic?: string;
}

export interface MessageComponents {
  greeting?: string;
  acknowledgment?: string;
  transition?: string;
  coreQuestion: string;
  context?: string;
  closing?: string;
}

export interface MessageTemplate {
  id: string;
  type: 'greeting' | 'acknowledgment' | 'transition' | 'closing';
  phase: ConversationPhase;
  region: string;
  formality: 'formal' | 'informal';
  timeContext?: 'morning' | 'afternoon' | 'evening' | 'night';
  template: string;
  variants: string[];
}

export interface ValidationResult {
  isValid: boolean;
  score: number;
  issues: string[];
  warnings: string[];
  suggestions: string[];
}

export class MessageComposer {
  private templates: MessageTemplate[] = [];

  constructor() {
    this.loadTemplates();
  }

  /**
   * Main entry point - compose a complete message from a raw question
   */
  async composeMessage(
    question: QuestionBank,
    context: MessageContext
  ): Promise<string> {

    // Determine components needed based on phase and context
    const components: MessageComponents = {
      coreQuestion: question.questionText
    };

    // Add greeting for first message or phase changes
    if (context.isFirstMessage || context.phase === 'greeting') {
      components.greeting = this.selectGreeting(context);
    }

    // Add acknowledgment if user just responded
    if (context.lastUserMessage && !context.isFirstMessage) {
      components.acknowledgment = this.createAcknowledgment(
        context.lastUserMessage,
        context.lastUserSentiment || 'neutral'
      );
    }

    // Add transition if topic is changing
    if (context.previousTopic && context.nextTopic &&
        context.previousTopic !== context.nextTopic) {
      components.transition = this.generateTransition(
        context.previousTopic,
        context.nextTopic,
        context
      );
    }

    // Wrap question in context
    components.context = this.wrapQuestion(question, context);

    // Compose final message
    const message = this.assembleMessage(components, context);

    // Validate and optimize
    const validation = this.validateMessage(message, context);

    if (!validation.isValid) {
      // Apply fixes for common issues
      return this.fixMessage(message, validation, context);
    }

    return message;
  }

  /**
   * Determine current conversation phase based on state
   */
  determineConversationPhase(
    messageCount: number,
    metrics?: ConversationMetrics
  ): ConversationPhase {

    if (messageCount === 0) {
      return 'greeting';
    }

    if (messageCount <= 3) {
      return 'exploration';
    }

    // Check if we have qualification metrics
    if (metrics) {
      const hasQualificationInfo =
        metrics.budgetSignalStrength > 0.3 ||
        metrics.authorityScore > 0.3 ||
        metrics.needIntensity > 0.5;

      if (!hasQualificationInfo && messageCount < 10) {
        return 'qualification';
      }

      if (hasQualificationInfo && metrics.technicalScore < 0.5) {
        return 'deepening';
      }

      if (messageCount > 15 || metrics.qualificationScore > 0.7) {
        return 'closing';
      }
    }

    // Default logic based on message count
    if (messageCount <= 8) {
      return 'qualification';
    } else if (messageCount <= 15) {
      return 'deepening';
    } else {
      return 'closing';
    }
  }

  /**
   * Select appropriate greeting based on context
   */
  selectGreeting(context: MessageContext): string {
    const { timeOfDay, isReturningUser, region, userFormality } = context;
    const formality = userFormality || 'formal'; // Default to formal for B2B

    // Returning user greetings
    if (isReturningUser) {
      const returningGreetings = [
        '¡Hola de nuevo! 👋',
        'Hola, ¿qué tal?',
        'Encantado de hablar contigo nuevamente.'
      ];
      return this.selectVariant(returningGreetings, context);
    }

    // First contact - time-based greeting
    let timeGreeting = '';
    switch (timeOfDay) {
      case 'morning':
        timeGreeting = '¡Buenos días!';
        break;
      case 'afternoon':
        timeGreeting = '¡Buenas tardes!';
        break;
      case 'evening':
      case 'night':
        timeGreeting = '¡Buenas noches!';
        break;
    }

    // Build complete greeting
    const introduction = formality === 'formal'
      ? 'Soy Lidia de Cronos AI Consulting.'
      : 'Soy Lidia, de Cronos AI Consulting.';

    const thanks = 'Gracias por su interés en nuestros servicios de consultoría.';

    const permissionAsking = formality === 'formal'
      ? '¿Sería un buen momento para conocer sus necesidades?'
      : '¿Te viene bien hablar ahora sobre tus necesidades?';

    return `${timeGreeting} 👋 ${introduction}\n\n${thanks}\n\n${permissionAsking}`;
  }

  /**
   * Generate acknowledgment for user's response
   */
  createAcknowledgment(
    userMessage: string,
    sentiment: 'positive' | 'negative' | 'neutral'
  ): string {

    const messageLength = userMessage.split(' ').length;
    const isDetailedResponse = messageLength > 15;

    // Positive sentiment acknowledgments
    if (sentiment === 'positive') {
      const positive = [
        'Excelente, me alegra escuchar eso.',
        'Perfecto, entiendo.',
        'Genial, eso es muy útil.',
        'Fantástico, aprecio la información.'
      ];
      return this.selectVariant(positive);
    }

    // Negative sentiment acknowledgments
    if (sentiment === 'negative') {
      const negative = [
        'Entiendo su preocupación.',
        'Comprendo la situación.',
        'Agradezco su sinceridad.',
        'Entiendo que puede ser complicado.'
      ];
      return this.selectVariant(negative);
    }

    // Neutral - adjust based on response length
    if (isDetailedResponse) {
      const detailed = [
        'Gracias por compartir esos detalles.',
        'Aprecio la información detallada.',
        'Entiendo, gracias por explicarlo.',
        'Perfecto, eso me da una mejor perspectiva.'
      ];
      return this.selectVariant(detailed);
    } else {
      const brief = [
        'Entiendo.',
        'Perfecto.',
        'De acuerdo.',
        'Gracias.'
      ];
      return this.selectVariant(brief);
    }
  }

  /**
   * Generate smooth transition between topics
   */
  generateTransition(
    previousTopic: string,
    nextTopic: string,
    context: MessageContext
  ): string {

    // Topic transition templates
    const transitions = {
      general: [
        'Ahora, me gustaría saber',
        'Por otro lado',
        'Cambiando de tema',
        'Relacionado con esto'
      ],
      deepening: [
        'Profundizando en este tema',
        'Para entender mejor',
        'Siguiendo con lo que mencionaste',
        'Sobre lo que comentabas'
      ],
      qualification: [
        'Para poder ayudarle mejor',
        'Con el fin de preparar una propuesta adecuada',
        'Para asegurarme de que nuestros servicios se ajusten',
        'Necesitaría saber'
      ]
    };

    let transitionType: keyof typeof transitions = 'general';

    if (context.phase === 'deepening') {
      transitionType = 'deepening';
    } else if (context.phase === 'qualification') {
      transitionType = 'qualification';
    }

    return this.selectVariant(transitions[transitionType]);
  }

  /**
   * Wrap raw question in conversational context
   */
  wrapQuestion(question: QuestionBank, context: MessageContext): string {
    const { phase, userFormality } = context;
    const formality = userFormality || 'formal';

    // Direct qualification questions need softening
    const isSensitiveQuestion =
      question.category === 'budget' ||
      question.category === 'authority';

    if (isSensitiveQuestion) {
      const softeners = formality === 'formal'
        ? [
          'Si no es indiscreción',
          'Si me permite la pregunta',
          'Para tener una mejor idea',
          'Con el fin de ofrecerle la mejor solución'
        ]
        : [
          'Si puedo preguntar',
          'Para entender mejor',
          'Si no te importa comentarme'
        ];

      const softener = this.selectVariant(softeners);
      return `${softener}, ${question.questionText.toLowerCase()}`;
    }

    // For exploration/technical questions, provide context
    if (phase === 'exploration' || phase === 'deepening') {
      const contexts = [
        `Me gustaría saber: ${question.questionText}`,
        `¿Podrías comentarme ${question.questionText.toLowerCase()}?`,
        `Sería útil entender: ${question.questionText}`
      ];
      return this.selectVariant(contexts);
    }

    // Default - return question as-is
    return question.questionText;
  }

  /**
   * Assemble all components into final message
   */
  private assembleMessage(
    components: MessageComponents,
    context: MessageContext
  ): string {

    const parts: string[] = [];

    // Add greeting (only for first message or phase change)
    if (components.greeting) {
      parts.push(components.greeting);
    }

    // Add acknowledgment (if user just responded)
    if (components.acknowledgment && !components.greeting) {
      parts.push(components.acknowledgment);
    }

    // Add transition (if changing topics)
    if (components.transition && !components.greeting) {
      parts.push(components.transition);
    }

    // Add context-wrapped question (always present)
    if (components.context) {
      parts.push(components.context);
    } else {
      parts.push(components.coreQuestion);
    }

    // Add closing (for specific phases)
    if (components.closing) {
      parts.push(components.closing);
    }

    // Join parts with appropriate spacing
    // If greeting exists, it's a longer message with double spacing
    if (components.greeting) {
      return parts.join('\n\n');
    }

    // For follow-up messages, single spacing
    return parts.join(' ');
  }

  /**
   * Validate message quality
   */
  validateMessage(message: string, context: MessageContext): ValidationResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Check length (WhatsApp optimal: 30-150 words)
    const wordCount = message.split(/\s+/).length;
    if (wordCount < 10) {
      issues.push('Message too short - may seem abrupt');
    }
    if (wordCount > 200) {
      issues.push('Message too long - may overwhelm user');
      suggestions.push('Split into multiple messages');
    }
    if (wordCount > 150) {
      warnings.push('Message longer than ideal (>150 words)');
    }

    // Check readability
    const avgWordLength = message.split(/\s+/)
      .reduce((sum, word) => sum + word.length, 0) / wordCount;
    if (avgWordLength > 8) {
      warnings.push('Complex vocabulary - may be hard to read on mobile');
    }

    // Check for multiple questions in one message (confusing)
    const questionMarks = (message.match(/\?/g) || []).length;
    if (questionMarks > 2) {
      issues.push('Multiple questions - user may not know which to answer');
      suggestions.push('Focus on one primary question');
    }

    // Check tone consistency (should have at least one polite marker)
    const politeMarkers = ['por favor', 'gracias', 'agradezco', 'aprecio'];
    const hasPoliteMarker = politeMarkers.some(marker =>
      message.toLowerCase().includes(marker)
    );
    if (!hasPoliteMarker && wordCount > 30) {
      warnings.push('Consider adding polite markers for B2B context');
    }

    // Check emoji usage (minimal in B2B)
    const emojiCount = (message.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > 2) {
      warnings.push('Too many emojis for B2B professional context');
    }

    // Calculate overall score
    const score = 1.0
      - (issues.length * 0.3)
      - (warnings.length * 0.1);

    return {
      isValid: issues.length === 0,
      score: Math.max(0, Math.min(1, score)),
      issues,
      warnings,
      suggestions
    };
  }

  /**
   * Fix common message issues
   */
  private fixMessage(
    message: string,
    validation: ValidationResult,
    context: MessageContext
  ): string {

    let fixed = message;

    // Fix: Message too long - try to shorten
    if (validation.issues.some(i => i.includes('too long'))) {
      // Remove redundant phrases
      fixed = fixed.replace(/\s+(por favor|gracias)\s+/gi, ' ');

      // If still too long, just truncate and add continuation
      const words = fixed.split(/\s+/);
      if (words.length > 180) {
        fixed = words.slice(0, 150).join(' ') + '...';
      }
    }

    // Fix: Multiple questions - keep only first question
    const questionMarks = (fixed.match(/\?/g) || []).length;
    if (questionMarks > 2) {
      // Find first question and keep only that
      const firstQuestion = fixed.split('?')[0] + '?';
      fixed = firstQuestion;
    }

    // Fix: Missing polite markers - add one if message is long enough
    if (validation.warnings.some(w => w.includes('polite markers'))) {
      if (!fixed.toLowerCase().includes('gracias')) {
        fixed = fixed.replace(/\.$/, '') + '. Gracias.';
      }
    }

    return fixed;
  }

  /**
   * Select random variant from template list (for A/B testing)
   */
  private selectVariant(variants: string[], context?: MessageContext): string {
    // TODO: Implement Thompson Sampling for A/B testing variants
    // For now, simple random selection
    const index = Math.floor(Math.random() * variants.length);
    return variants[index];
  }

  /**
   * Load message templates from configuration
   * TODO: Load from database or config file
   */
  private loadTemplates(): void {
    // Templates will be loaded from database in future
    // For now, templates are hardcoded in methods above
    this.templates = [];
  }

  /**
   * Get time of day from timestamp
   */
  static getTimeOfDay(timestamp: Date = new Date()): 'morning' | 'afternoon' | 'evening' | 'night' {
    const hour = timestamp.getHours();

    if (hour >= 6 && hour < 12) {
      return 'morning';
    } else if (hour >= 12 && hour < 19) {
      return 'afternoon';
    } else if (hour >= 19 && hour < 22) {
      return 'evening';
    } else {
      return 'night';
    }
  }

  /**
   * Detect if user is returning (has prior conversation history)
   */
  static async isReturningUser(conversationId: string): Promise<boolean> {
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) return false;

    return (conversation.messageCount || 0) > 0;
  }

  /**
   * Build complete message context from conversation state
   */
  static async buildContext(
    conversationId: string,
    question: QuestionBank
  ): Promise<MessageContext> {

    const conversation = await storage.getConversation(conversationId);
    const messages = await storage.getMessages(conversationId);
    const metrics = await storage.getLatestMetrics(conversationId);

    const messageCount = messages.length;
    const lastUserMessage = messages
      .filter(m => m.direction === 'incoming')
      .pop();

    const composer = new MessageComposer();
    const phase = composer.determineConversationPhase(messageCount, metrics || undefined);

    return {
      conversationId,
      phase,
      messageCount,
      lastUserMessage: lastUserMessage?.content,
      lastUserSentiment: lastUserMessage
        ? await grokNLPService.quickSentiment(lastUserMessage.content)
        : 'neutral',
      timeOfDay: MessageComposer.getTimeOfDay(),
      isFirstMessage: messageCount === 0,
      isReturningUser: await MessageComposer.isReturningUser(conversationId),
      userFormality: lastUserMessage
        ? await grokNLPService.quickFormality(lastUserMessage.content)
        : 'formal',
      region: conversation?.region || 'ES',
      previousTopic: question.category, // Simplified
      nextTopic: question.category
    };
  }
}

// Export singleton instance
export const messageComposer = new MessageComposer();