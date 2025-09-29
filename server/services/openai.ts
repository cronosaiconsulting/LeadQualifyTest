import OpenAI from "openai";
import type { SituationAwarenessState } from "@shared/schema";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "default_key"
});

export interface QuestionSuggestion {
  question: string;
  category: string;
  reasoning: string;
  expectedMetrics: string[];
  confidence: number;
  urgency: number;
}

export interface MetricAnalysis {
  dimension: string;
  metric: string;
  value: number;
  interpretation: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

export interface LATAMCulturalAnalysis {
  formalityLevel: number; // 0-1 scale
  formalityMarkers: {
    ustedUsage: boolean;
    tuteoUsage: boolean;
    voseoUsage: boolean;
    formalGreetings: string[];
    informalMarkers: string[];
  };
  codeSwitching: {
    detected: boolean;
    spanishEnglishMix: string[];
    sophisticationLevel: number;
  };
  negotiationStyle: {
    politenessLevel: number;
    directnessLevel: number;
    hierarchyRespect: number;
    timeOrientation: 'monochronic' | 'polychronic' | 'mixed';
  };
  schedulingEtiquette: {
    timeReferences: string[];
    flexibilityIndicators: string[];
    urgencyMarkers: string[];
  };
  regionalMarkers: {
    countryIndicators: string[];
    dialectMarkers: string[];
    businessCultureSignals: string[];
  };
  communicationPatterns: {
    indirectness: number;
    contextualness: number;
    relationshipFocus: number;
  };
}

export class OpenAIService {
  async analyzeMessage(message: string, language: string = "es"): Promise<{
    sentiment: number;
    technicalLevel: number;
    urgencyLevel: number;
    budgetSignals: string[];
    authoritySignals: string[];
    needSignals: string[];
    culturalMarkers: string[];
    objectionTone: number;
    dealSizeIndicators: string[];
    advancementSignals: string[];
  }> {
    try {
      const prompt = `Analyze the following message in ${language} for B2B lead qualification with sophisticated LATAM cultural analysis. Provide analysis in JSON format:

Message: "${message}"

Provide the following analysis:
- sentiment: number from -1 to 1 (negative to positive)
- technicalLevel: number from 0 to 1 (non-technical to highly technical)
- urgencyLevel: number from 0 to 1 (no urgency to very urgent)
- budgetSignals: array of detected budget-related phrases (look for specific amounts, ranges, "presupuesto", "inversión", etc.)
- authoritySignals: array of detected authority/decision-making phrases ("soy el", "decisión", "jefe", "director", etc.)
- needSignals: array of detected need/pain point phrases
- culturalMarkers: array of cultural/regional communication markers
- objectionTone: number from 0 to 1 (resistance or pushback tone)
- dealSizeIndicators: array of phrases that suggest deal size (~$10,000 range indicators)
- advancementSignals: array of phrases indicating readiness to advance ("reunión", "propuesta", "siguiente paso")

Focus on LATAM business patterns, formality levels, and high-ticket consulting deal indicators.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert in B2B communication analysis for Spanish/LATAM markets. Analyze messages for lead qualification metrics and respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        sentiment: Math.max(-1, Math.min(1, analysis.sentiment || 0)),
        technicalLevel: Math.max(0, Math.min(1, analysis.technicalLevel || 0)),
        urgencyLevel: Math.max(0, Math.min(1, analysis.urgencyLevel || 0)),
        budgetSignals: analysis.budgetSignals || [],
        authoritySignals: analysis.authoritySignals || [],
        needSignals: analysis.needSignals || [],
        culturalMarkers: analysis.culturalMarkers || [],
        objectionTone: Math.max(0, Math.min(1, analysis.objectionTone || 0)),
        dealSizeIndicators: analysis.dealSizeIndicators || [],
        advancementSignals: analysis.advancementSignals || []
      };
    } catch (error) {
      console.error('Error analyzing message:', error);
      return {
        sentiment: 0,
        technicalLevel: 0,
        urgencyLevel: 0,
        budgetSignals: [],
        authoritySignals: [],
        needSignals: [],
        culturalMarkers: [],
        objectionTone: 0,
        dealSizeIndicators: [],
        advancementSignals: []
      };
    }
  }

  async analyzeLATAMCulturalContext(message: string, conversationHistory: string[] = []): Promise<LATAMCulturalAnalysis> {
    try {
      const fullContext = [...conversationHistory, message].join('\n');
      
      const prompt = `Perform sophisticated LATAM cultural analysis of this Spanish business conversation. Analyze for formality, regional patterns, and business communication nuances.

Conversation Context:
${fullContext}

Provide detailed analysis in JSON format:
{
  "formalityLevel": 0.75,
  "formalityMarkers": {
    "ustedUsage": true,
    "tuteoUsage": false,
    "voseoUsage": false,
    "formalGreetings": ["Buenos días", "Me complace"],
    "informalMarkers": ["che", "está bien", "vale"]
  },
  "codeSwitching": {
    "detected": false,
    "spanishEnglishMix": ["meeting", "budget"],
    "sophisticationLevel": 0.8
  },
  "negotiationStyle": {
    "politenessLevel": 0.85,
    "directnessLevel": 0.4,
    "hierarchyRespect": 0.9,
    "timeOrientation": "polychronic"
  },
  "schedulingEtiquette": {
    "timeReferences": ["la próxima semana", "cuando le convenga"],
    "flexibilityIndicators": ["si es posible", "dependiendo de"],
    "urgencyMarkers": ["urgente", "lo antes posible"]
  },
  "regionalMarkers": {
    "countryIndicators": ["plata" (Argentina), "guita", "vos"],
    "dialectMarkers": ["che", "boludo", "mamagallismo"],
    "businessCultureSignals": ["relación personal", "confianza"]
  },
  "communicationPatterns": {
    "indirectness": 0.7,
    "contextualness": 0.8,
    "relationshipFocus": 0.9
  }
}

Focus on:
- Precise formality detection (usted vs tuteo vs voseo usage)
- Code-switching between Spanish/English in business contexts
- LATAM negotiation politeness (indirect vs direct communication)
- Time and scheduling cultural patterns
- Regional dialect and business culture markers
- Relationship-oriented vs task-oriented communication patterns`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert in LATAM cultural analysis, specializing in Spanish business communication patterns, regional dialects, and cultural nuances across Latin America. Respond with precise JSON analysis only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        formalityLevel: Math.max(0, Math.min(1, analysis.formalityLevel || 0.5)),
        formalityMarkers: {
          ustedUsage: analysis.formalityMarkers?.ustedUsage || false,
          tuteoUsage: analysis.formalityMarkers?.tuteoUsage || false,
          voseoUsage: analysis.formalityMarkers?.voseoUsage || false,
          formalGreetings: analysis.formalityMarkers?.formalGreetings || [],
          informalMarkers: analysis.formalityMarkers?.informalMarkers || []
        },
        codeSwitching: {
          detected: analysis.codeSwitching?.detected || false,
          spanishEnglishMix: analysis.codeSwitching?.spanishEnglishMix || [],
          sophisticationLevel: Math.max(0, Math.min(1, analysis.codeSwitching?.sophisticationLevel || 0))
        },
        negotiationStyle: {
          politenessLevel: Math.max(0, Math.min(1, analysis.negotiationStyle?.politenessLevel || 0.5)),
          directnessLevel: Math.max(0, Math.min(1, analysis.negotiationStyle?.directnessLevel || 0.5)),
          hierarchyRespect: Math.max(0, Math.min(1, analysis.negotiationStyle?.hierarchyRespect || 0.5)),
          timeOrientation: analysis.negotiationStyle?.timeOrientation || 'mixed'
        },
        schedulingEtiquette: {
          timeReferences: analysis.schedulingEtiquette?.timeReferences || [],
          flexibilityIndicators: analysis.schedulingEtiquette?.flexibilityIndicators || [],
          urgencyMarkers: analysis.schedulingEtiquette?.urgencyMarkers || []
        },
        regionalMarkers: {
          countryIndicators: analysis.regionalMarkers?.countryIndicators || [],
          dialectMarkers: analysis.regionalMarkers?.dialectMarkers || [],
          businessCultureSignals: analysis.regionalMarkers?.businessCultureSignals || []
        },
        communicationPatterns: {
          indirectness: Math.max(0, Math.min(1, analysis.communicationPatterns?.indirectness || 0.5)),
          contextualness: Math.max(0, Math.min(1, analysis.communicationPatterns?.contextualness || 0.5)),
          relationshipFocus: Math.max(0, Math.min(1, analysis.communicationPatterns?.relationshipFocus || 0.5))
        }
      };
    } catch (error) {
      console.error('Error analyzing LATAM cultural context:', error);
      return {
        formalityLevel: 0.5,
        formalityMarkers: {
          ustedUsage: false,
          tuteoUsage: false,
          voseoUsage: false,
          formalGreetings: [],
          informalMarkers: []
        },
        codeSwitching: {
          detected: false,
          spanishEnglishMix: [],
          sophisticationLevel: 0
        },
        negotiationStyle: {
          politenessLevel: 0.5,
          directnessLevel: 0.5,
          hierarchyRespect: 0.5,
          timeOrientation: 'mixed'
        },
        schedulingEtiquette: {
          timeReferences: [],
          flexibilityIndicators: [],
          urgencyMarkers: []
        },
        regionalMarkers: {
          countryIndicators: [],
          dialectMarkers: [],
          businessCultureSignals: []
        },
        communicationPatterns: {
          indirectness: 0.5,
          contextualness: 0.5,
          relationshipFocus: 0.5
        }
      };
    }
  }

  async suggestNextQuestion(
    state: SituationAwarenessState,
    conversationHistory: string[],
    availableQuestions: any[]
  ): Promise<QuestionSuggestion> {
    try {
      const prompt = `As an AI lead qualification expert, suggest the optimal next question based on the current conversation state.

Current State:
- Message Count: ${state.messageCount}
- Engagement Score: ${state.dimensions.engagement.score}
- Qualification Score: ${state.dimensions.qualification.score}
- Technical Score: ${state.dimensions.technical.score}
- Emotional Score: ${state.dimensions.emotional.score}
- Cultural Score: ${state.dimensions.cultural.score}

Recent Conversation History:
${conversationHistory.slice(-5).join('\n')}

Available Question Categories: ${availableQuestions.map(q => q.category).join(', ')}

Consider:
1. Information gaps (lowest scores need attention)
2. Conversation flow and engagement
3. Spanish/LATAM business communication norms
4. Risk of fatigue (message count > 15)
5. Optimal timing for sensitive topics (budget, authority)

Provide response in JSON format:
{
  "question": "The exact question to ask in Spanish",
  "category": "budget|authority|need|technical|timeline|relationship",
  "reasoning": "Why this question is optimal now",
  "expectedMetrics": ["list", "of", "metrics", "this", "will", "improve"],
  "confidence": 0.85,
  "urgency": 0.6
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert B2B lead qualification consultant specializing in Spanish/LATAM markets. Your responses must be in valid JSON format only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const suggestion = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        question: suggestion.question || "¿Podría contarme más sobre su situación actual?",
        category: suggestion.category || "need",
        reasoning: suggestion.reasoning || "Gathering basic information",
        expectedMetrics: suggestion.expectedMetrics || ["engagement"],
        confidence: Math.max(0, Math.min(1, suggestion.confidence || 0.5)),
        urgency: Math.max(0, Math.min(1, suggestion.urgency || 0.5))
      };
    } catch (error) {
      console.error('Error suggesting question:', error);
      return {
        question: "¿Podría contarme más sobre los desafíos que enfrenta su empresa actualmente?",
        category: "need",
        reasoning: "Fallback question for need assessment",
        expectedMetrics: ["need", "engagement"],
        confidence: 0.3,
        urgency: 0.5
      };
    }
  }

  async generateMetricExplanation(
    metricName: string,
    value: number,
    context: any
  ): Promise<string> {
    try {
      const prompt = `Explain the metric "${metricName}" with value ${value} in the context of B2B lead qualification.

Context: ${JSON.stringify(context)}

Provide a clear, actionable explanation in Spanish that explains:
1. What this metric means
2. How to interpret the current value
3. What actions might improve it
4. Why it matters for lead qualification

Keep it concise and practical.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are a B2B sales expert explaining conversation metrics to sales teams. Respond in clear, practical Spanish."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

      return response.choices[0].message.content || `Métrica ${metricName}: ${value}`;
    } catch (error) {
      console.error('Error generating explanation:', error);
      return `Métrica ${metricName}: ${value} - No se pudo generar explicación detallada.`;
    }
  }

  async detectConversationPattern(
    conversationHistory: string[],
    metrics: any
  ): Promise<{
    pattern: string;
    confidence: number;
    characteristics: string[];
    recommendations: string[];
  }> {
    try {
      const prompt = `Analyze this conversation pattern based on the history and metrics.

Conversation History (last 10 messages):
${conversationHistory.slice(-10).join('\n')}

Current Metrics:
${JSON.stringify(metrics, null, 2)}

Identify the conversation pattern and provide analysis in JSON format:
{
  "pattern": "quick_qualifier|tech_explorer|relationship_builder|price_shopper|time_waster",
  "confidence": 0.85,
  "characteristics": ["list", "of", "observed", "characteristics"],
  "recommendations": ["actionable", "strategy", "recommendations"]
}

Consider Spanish/LATAM business communication patterns.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert in B2B conversation pattern analysis for Spanish/LATAM markets. Respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const analysis = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        pattern: analysis.pattern || "relationship_builder",
        confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
        characteristics: analysis.characteristics || [],
        recommendations: analysis.recommendations || []
      };
    } catch (error) {
      console.error('Error detecting pattern:', error);
      return {
        pattern: "relationship_builder",
        confidence: 0.3,
        characteristics: ["Unable to analyze pattern"],
        recommendations: ["Continue gathering information"]
      };
    }
  }
}

export const openaiService = new OpenAIService();
