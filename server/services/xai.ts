// xAI Grok service for sophisticated Spanish LATAM conversation analysis
// Replaces OpenAI service with trace-first reasoning architecture
import OpenAI from "openai";
import type { SituationAwarenessState } from "@shared/schema";

// Initialize xAI client using OpenAI SDK with xAI base URL
const xai = new OpenAI({ 
  baseURL: "https://api.x.ai/v1", 
  apiKey: process.env.XAI_API_KEY 
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

export interface ReasoningStep {
  step: number;
  description: string;
  evidence: string[];
  confidence: number;
  reasoning: string;
}

export interface DecisionReasoning {
  decisionType: string;
  inputFeatures: Record<string, any>;
  candidatesConsidered: any[];
  chosenOption: any;
  reasoningSteps: ReasoningStep[];
  finalConfidence: number;
  alternativesConsidered: string[];
  riskFactors: string[];
  businessJustification: string;
}

export class XAIService {
  
  /**
   * Simulates realistic Spanish/LATAM B2B conversations for testing
   */
  async simulateConversation(params: {
    conversationId: string;
    scenario: string;
    messageCount: number;
    dealSize: number;
    language: string;
    region: string;
  }): Promise<{
    success: boolean;
    messages: Array<{ direction: 'incoming' | 'outgoing'; content: string; }>;
    error?: string;
  }> {
    try {
      const prompt = `Generate a realistic Spanish/LATAM B2B conversation simulation for lead qualification.

SIMULATION PARAMETERS:
- Scenario: ${params.scenario}
- Target messages: ${params.messageCount}
- Deal size: €${params.dealSize}
- Language: ${params.language}
- Region: ${params.region}

CONVERSATION CONTEXT:
- Business: Software consulting/implementation services
- Target client: Medium-sized Spanish/LATAM company
- Budget range: €8,000 - €15,000
- Typical needs: Digital transformation, process automation, system integration

CULTURAL CONSIDERATIONS:
- Use appropriate formality level (usted/tuteo based on business context)
- Include regional Spanish expressions and business terminology
- Reflect LATAM business communication patterns
- Show progression from formal introduction to business discussion

CONVERSATION FLOW:
1. Initial contact/greeting (incoming)
2. Business introduction and needs discovery
3. Budget/authority qualification 
4. Technical requirements discussion
5. Timeline and decision process
6. Next steps/advancement

Generate ${params.messageCount} alternating messages (incoming from prospect, outgoing as responses) in JSON format:

{
  "success": true,
  "messages": [
    {
      "direction": "incoming",
      "content": "Spanish message from prospect"
    },
    {
      "direction": "outgoing", 
      "content": "Professional response in Spanish"
    }
  ],
  "scenario": "${params.scenario}",
  "insights": {
    "culturalMarkers": ["markers found"],
    "businessSignals": ["signals detected"],
    "qualificationLevel": "description"
  }
}

Make the conversation realistic, with natural progression and authentic Spanish business communication.`;

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are an expert in Spanish/LATAM business communication and B2B lead qualification. Generate realistic conversation simulations with authentic cultural and business context. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.7
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response');
      }

      // Parse the JSON response
      const result = JSON.parse(content);
      
      // Validate the response structure
      if (!result.success || !Array.isArray(result.messages)) {
        throw new Error('Invalid simulation response format');
      }

      return {
        success: true,
        messages: result.messages,
      };
    } catch (error) {
      console.error('Conversation simulation error:', error);
      return {
        success: false,
        messages: [],
        error: `Failed to simulate conversation: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Analyzes messages with sophisticated Spanish LATAM cultural understanding
   * Generates structured reasoning for each analysis decision
   */
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
    reasoning: DecisionReasoning;
  }> {
    try {
      const prompt = `You are an expert in B2B lead qualification for Spanish/LATAM markets. Analyze the following message with sophisticated cultural understanding and provide detailed reasoning for each decision.

Message: "${message}"

Provide analysis in JSON format with detailed reasoning:

{
  "analysis": {
    "sentiment": number from -1 to 1,
    "technicalLevel": number from 0 to 1,
    "urgencyLevel": number from 0 to 1,
    "budgetSignals": array of detected budget phrases,
    "authoritySignals": array of authority indicators,
    "needSignals": array of pain point phrases,
    "culturalMarkers": array of cultural/regional markers,
    "objectionTone": number from 0 to 1,
    "dealSizeIndicators": array of deal size signals (~$10,000 range),
    "advancementSignals": array of advancement readiness phrases
  },
  "reasoning": {
    "decisionType": "message_analysis",
    "inputFeatures": {
      "messageLength": number,
      "languageComplexity": number,
      "businessTerms": string[],
      "emotionalMarkers": string[]
    },
    "candidatesConsidered": [
      "Multiple sentiment interpretations",
      "Various technical complexity levels",
      "Different urgency assessments"
    ],
    "chosenOption": "Selected analysis with highest confidence",
    "reasoningSteps": [
      {
        "step": 1,
        "description": "Cultural Context Analysis",
        "evidence": ["specific phrases", "formality markers"],
        "confidence": number,
        "reasoning": "Why this cultural interpretation was chosen"
      },
      {
        "step": 2,
        "description": "Business Intent Classification",
        "evidence": ["business indicators", "need signals"],
        "confidence": number,
        "reasoning": "Evidence for business intent assessment"
      },
      {
        "step": 3,
        "description": "LATAM Market Context",
        "evidence": ["regional markers", "communication patterns"],
        "confidence": number,
        "reasoning": "How LATAM context influences interpretation"
      }
    ],
    "finalConfidence": number,
    "alternativesConsidered": ["other possible interpretations"],
    "riskFactors": ["potential misinterpretations"],
    "businessJustification": "Why this analysis optimizes lead qualification"
  }
}

Focus on LATAM business communication patterns, formality levels (usted/tuteo), and $10,000+ consulting deal indicators.`;

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are an expert in B2B communication analysis for Spanish/LATAM markets. Provide detailed analysis with step-by-step reasoning. Always respond with valid JSON only."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3 // Lower temperature for more consistent reasoning
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const analysis = result.analysis || {};
      
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
        advancementSignals: analysis.advancementSignals || [],
        reasoning: result.reasoning || this.createFallbackReasoning("message_analysis")
      };
    } catch (error) {
      console.error('Error analyzing message with xAI:', error);
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
        advancementSignals: [],
        reasoning: this.createFallbackReasoning("message_analysis", error)
      };
    }
  }

  /**
   * Generates sophisticated LATAM cultural analysis with detailed reasoning
   */
  async analyzeLATAMCulturalContext(message: string, conversationHistory: string[] = []): Promise<LATAMCulturalAnalysis & { reasoning: DecisionReasoning }> {
    try {
      const fullContext = [...conversationHistory, message].join('\n');
      
      const prompt = `Perform sophisticated LATAM cultural analysis of this Spanish business conversation. Provide detailed reasoning for each cultural assessment.

Conversation Context:
${fullContext}

Provide detailed analysis in JSON format:
{
  "culturalAnalysis": {
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
      "timeReferences": ["próxima semana", "cuando tenga tiempo"],
      "flexibilityIndicators": ["disponibilidad", "coordinar"],
      "urgencyMarkers": ["urgente", "pronto"]
    },
    "regionalMarkers": {
      "countryIndicators": ["specific regional terms"],
      "dialectMarkers": ["voseo", "che", regional expressions"],
      "businessCultureSignals": ["hierarchical language", "relationship focus"]
    },
    "communicationPatterns": {
      "indirectness": 0.7,
      "contextualness": 0.8,
      "relationshipFocus": 0.9
    }
  },
  "reasoning": {
    "decisionType": "cultural_analysis",
    "inputFeatures": {
      "messageCount": number,
      "formalityMarkers": string[],
      "businessContext": string,
      "relationshipPhase": string
    },
    "reasoningSteps": [
      {
        "step": 1,
        "description": "Formality Level Assessment",
        "evidence": ["usted usage", "formal greetings"],
        "confidence": number,
        "reasoning": "Evidence for formality classification"
      },
      {
        "step": 2,
        "description": "Regional Identification",
        "evidence": ["dialect markers", "regional expressions"],
        "confidence": number,
        "reasoning": "How regional markers indicate origin"
      }
    ]
  }
}`;

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are an expert in LATAM business culture and Spanish language variations. Provide detailed cultural analysis with step-by-step reasoning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const analysis = result.culturalAnalysis || {};

      return {
        ...analysis,
        reasoning: result.reasoning || this.createFallbackReasoning("cultural_analysis")
      };
    } catch (error) {
      console.error('Error in LATAM cultural analysis:', error);
      return this.createFallbackCulturalAnalysis(error);
    }
  }

  /**
   * Suggests next question with explicit reasoning for the decision
   */
  async suggestNextQuestion(
    situationState: SituationAwarenessState, 
    messageHistory: string[], 
    availableQuestions: any[]
  ): Promise<QuestionSuggestion & { reasoning: DecisionReasoning }> {
    try {
      const prompt = `You are an expert B2B lead qualification assistant for Spanish/LATAM markets. 

Current Situation:
${JSON.stringify(situationState, null, 2)}

Recent Messages:
${messageHistory.slice(-5).join('\n')}

Available Questions:
${availableQuestions.slice(0, 10).map(q => `${q.category}: ${q.questionText}`).join('\n')}

Provide detailed question recommendation with reasoning:

{
  "suggestion": {
    "question": "optimal question text",
    "category": "question category",
    "reasoning": "brief explanation",
    "expectedMetrics": ["metrics this question will improve"],
    "confidence": number 0-1,
    "urgency": number 0-1
  },
  "reasoning": {
    "decisionType": "question_selection",
    "inputFeatures": {
      "currentQualificationScore": number,
      "conversationStage": string,
      "unknownFactors": string[],
      "culturalContext": string
    },
    "candidatesConsidered": [
      {
        "question": "candidate question",
        "score": number,
        "rationale": "why considered"
      }
    ],
    "chosenOption": {
      "question": "selected question",
      "score": number,
      "advantages": string[]
    },
    "reasoningSteps": [
      {
        "step": 1,
        "description": "Conversation Stage Analysis",
        "evidence": ["current metrics", "message patterns"],
        "confidence": number,
        "reasoning": "Why this stage classification"
      },
      {
        "step": 2, 
        "description": "Information Gap Identification",
        "evidence": ["missing qualification data"],
        "confidence": number,
        "reasoning": "Critical gaps that need filling"
      },
      {
        "step": 3,
        "description": "Cultural Appropriateness Check",
        "evidence": ["formality level", "business culture"],
        "confidence": number,
        "reasoning": "How question fits LATAM context"
      }
    ],
    "alternativesConsidered": ["other viable questions"],
    "businessJustification": "How this question advances qualification"
  }
}`;

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are an expert in B2B lead qualification for LATAM markets. Always provide detailed step-by-step reasoning for question selection."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      const suggestion = result.suggestion || {};

      return {
        question: suggestion.question || "¿Podrías contarme más sobre tus necesidades específicas?",
        category: suggestion.category || "general", 
        reasoning: result.reasoning || this.createFallbackReasoning("question_selection"),
        expectedMetrics: suggestion.expectedMetrics || ["engagement"],
        confidence: Math.max(0, Math.min(1, suggestion.confidence || 0.5)),
        urgency: Math.max(0, Math.min(1, suggestion.urgency || 0.3))
      };
    } catch (error) {
      console.error('Error suggesting question with xAI:', error);
      return this.createFallbackQuestionSuggestion(error);
    }
  }

  /**
   * Generates metric explanation with reasoning
   */
  async generateMetricExplanation(metricName: string, value: number, context: any): Promise<{ explanation: string; reasoning: DecisionReasoning }> {
    try {
      const prompt = `Explain this B2B lead qualification metric for business users in Spanish/LATAM context.

Metric: ${metricName}
Value: ${value}
Context: ${JSON.stringify(context)}

Provide explanation with reasoning in JSON:

{
  "explanation": "clear business explanation in Spanish/English",
  "reasoning": {
    "decisionType": "metric_explanation",
    "inputFeatures": {
      "metricValue": number,
      "businessContext": string,
      "culturalFactors": string[]
    },
    "reasoningSteps": [
      {
        "step": 1,
        "description": "Metric Interpretation",
        "evidence": ["data points", "thresholds"],
        "confidence": number,
        "reasoning": "Why this interpretation"
      }
    ],
    "businessJustification": "How this metric impacts lead qualification"
  }
}`;

      const response = await xai.chat.completions.create({
        model: "grok-2-1212",
        messages: [
          {
            role: "system",
            content: "You are an expert in explaining B2B metrics for LATAM business contexts. Provide clear, actionable explanations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        explanation: result.explanation || `Metric ${metricName}: ${value}`,
        reasoning: result.reasoning || this.createFallbackReasoning("metric_explanation")
      };
    } catch (error) {
      console.error('Error generating metric explanation:', error);
      return {
        explanation: `Metric ${metricName} has value ${value}`,
        reasoning: this.createFallbackReasoning("metric_explanation", error)
      };
    }
  }

  /**
   * Creates fallback reasoning when AI analysis fails
   */
  private createFallbackReasoning(decisionType: string, error?: any): DecisionReasoning {
    return {
      decisionType,
      inputFeatures: {},
      candidatesConsidered: [],
      chosenOption: "fallback_option",
      reasoningSteps: [
        {
          step: 1,
          description: "Fallback Analysis",
          evidence: ["error_handling"],
          confidence: 0.1,
          reasoning: error ? `Error occurred: ${error.message}` : "Using fallback reasoning due to analysis failure"
        }
      ],
      finalConfidence: 0.1,
      alternativesConsidered: [],
      riskFactors: ["analysis_failure"],
      businessJustification: "Fallback reasoning to maintain system operation"
    };
  }

  private createFallbackCulturalAnalysis(error?: any): LATAMCulturalAnalysis & { reasoning: DecisionReasoning } {
    return {
      formalityLevel: 0.5,
      formalityMarkers: {
        ustedUsage: false,
        tuteoUsage: true,
        voseoUsage: false,
        formalGreetings: [],
        informalMarkers: []
      },
      codeSwitching: {
        detected: false,
        spanishEnglishMix: [],
        sophisticationLevel: 0.5
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
      },
      reasoning: this.createFallbackReasoning("cultural_analysis", error)
    };
  }

  private createFallbackQuestionSuggestion(error?: any): QuestionSuggestion & { reasoning: DecisionReasoning } {
    return {
      question: "¿Podrías contarme más sobre tus necesidades específicas?",
      category: "general",
      reasoning: "Fallback general question for engagement",
      expectedMetrics: ["engagement"],
      confidence: 0.3,
      urgency: 0.2,
      reasoning: this.createFallbackReasoning("question_selection", error)
    };
  }
}

// Export singleton instance
export const xaiService = new XAIService();