// Grok-Based NLP Service for Spanish (Castilian) B2B Analysis
// Uses xAI Grok-4-Fast for contextual understanding of business conversations

import { xaiService } from "./xai";

export interface Entity {
  text: string;
  type: 'PERSON' | 'COMPANY' | 'MONEY' | 'DATE' | 'LOCATION' | 'PRODUCT' | 'TECHNOLOGY';
  value?: any;
  confidence: number;
}

export interface SentimentResult {
  score: number; // -1 to 1
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  reasoning: string;
}

export interface FormalityResult {
  formality: 'formal' | 'informal';
  confidence: number;
  markers: string[];
}

export interface BudgetSignals {
  hasExplicitBudget: boolean;
  estimatedBudget?: number;
  budgetRange?: { min: number; max: number };
  budgetIndicators: string[];
  confidence: number;
  meetsMinimum: boolean; // >= 5000€
}

export interface SPOCAvailability {
  hasDesignatedContact: boolean;
  estimatedHoursPerWeek?: number;
  availabilityIndicators: string[];
  confidence: number;
  meetsMinimum: boolean; // >= 4 hours/week
}

export interface DigitalMaturitySignals {
  maturityLevel: 'low' | 'medium' | 'high';
  indicators: string[];
  hasCurrentTools: boolean;
  hasProcesses: boolean;
  hasTechnicalTeam: boolean;
  confidence: number;
}

export interface AuthoritySignals {
  authorityLevel: 'decision-maker' | 'influencer' | 'information-gatherer';
  title?: string;
  decisionProcess: 'individual' | 'committee' | 'unknown';
  confidence: number;
}

export interface UrgencySignals {
  urgencyLevel: 'high' | 'medium' | 'low';
  timeline?: string;
  indicators: string[];
  confidence: number;
}

export interface MessageAnalysis {
  entities: Entity[];
  sentiment: SentimentResult;
  formality: FormalityResult;
  budgetSignals: BudgetSignals;
  spocAvailability: SPOCAvailability;
  digitalMaturity: DigitalMaturitySignals;
  authoritySignals: AuthoritySignals;
  urgencySignals: UrgencySignals;
  confusionLevel: number;
  frustrationLevel: number;
  keyInsights: string[];
}

export class GrokNLPService {

  /**
   * Analyze message using Grok-4-Fast with structured output
   */
  async analyzeMessage(text: string, conversationHistory?: string[]): Promise<MessageAnalysis> {
    const prompt = this.buildAnalysisPrompt(text, conversationHistory);

    try {
      const response = await xaiService.chat(prompt, {
        temperature: 0.1, // Low temperature for consistent structured extraction
        response_format: 'json'
      });

      return this.parseAnalysisResponse(response);
    } catch (error) {
      console.error('Grok NLP analysis failed:', error);
      return this.getFallbackAnalysis(text);
    }
  }

  /**
   * Build structured prompt for Grok analysis
   */
  private buildAnalysisPrompt(text: string, conversationHistory?: string[]): string {
    const context = conversationHistory
      ? `\n\nConversation history:\n${conversationHistory.slice(-3).join('\n')}`
      : '';

    return `Eres un experto analista de conversaciones B2B en español (castellano de España).

Analiza este mensaje de WhatsApp de un prospecto potencial y extrae información estructurada.

CONTEXTO DEL NEGOCIO:
- Buscamos PYMEs con presupuesto mínimo de 5.000€
- Necesitan un SPOC (Single Point of Contact) con mínimo 4 horas/semana disponibles
- Deben tener madurez digital media (herramientas básicas, procesos establecidos)

MENSAJE DEL PROSPECTO:
"${text}"${context}

ANÁLISIS REQUERIDO (responde en JSON válido):

{
  "entities": [
    {
      "text": "texto extraído",
      "type": "PERSON|COMPANY|MONEY|DATE|LOCATION|PRODUCT|TECHNOLOGY",
      "value": "valor normalizado si aplica",
      "confidence": 0.0-1.0
    }
  ],
  "sentiment": {
    "score": -1.0 a 1.0,
    "label": "positive|negative|neutral",
    "confidence": 0.0-1.0,
    "reasoning": "explicación breve"
  },
  "formality": {
    "formality": "formal|informal",
    "confidence": 0.0-1.0,
    "markers": ["usted", "señor", etc]
  },
  "budgetSignals": {
    "hasExplicitBudget": boolean,
    "estimatedBudget": número en euros o null,
    "budgetRange": {"min": número, "max": número} o null,
    "budgetIndicators": ["frases que indican presupuesto"],
    "confidence": 0.0-1.0,
    "meetsMinimum": boolean (>= 5000€)
  },
  "spocAvailability": {
    "hasDesignatedContact": boolean,
    "estimatedHoursPerWeek": número o null,
    "availabilityIndicators": ["frases sobre disponibilidad"],
    "confidence": 0.0-1.0,
    "meetsMinimum": boolean (>= 4 horas/semana)
  },
  "digitalMaturity": {
    "maturityLevel": "low|medium|high",
    "indicators": ["herramientas/procesos mencionados"],
    "hasCurrentTools": boolean,
    "hasProcesses": boolean,
    "hasTechnicalTeam": boolean,
    "confidence": 0.0-1.0
  },
  "authoritySignals": {
    "authorityLevel": "decision-maker|influencer|information-gatherer",
    "title": "cargo si se menciona",
    "decisionProcess": "individual|committee|unknown",
    "confidence": 0.0-1.0
  },
  "urgencySignals": {
    "urgencyLevel": "high|medium|low",
    "timeline": "plazo mencionado",
    "indicators": ["palabras de urgencia"],
    "confidence": 0.0-1.0
  },
  "confusionLevel": 0.0-1.0,
  "frustrationLevel": 0.0-1.0,
  "keyInsights": ["insights clave de 1 línea"]
}

INSTRUCCIONES ESPECÍFICAS:
1. Para presupuesto: detecta menciones explícitas e implícitas. Palabras clave: "presupuesto", "inversión", "coste", "precio", cantidades en €
2. Para SPOC: detecta disponibilidad ("tengo tiempo", "puedo dedicar", "reunión semanal", "disponible")
3. Para madurez digital: busca menciones de herramientas (CRM, ERP, software), procesos establecidos, equipo técnico
4. Para autoridad: títulos (director, gerente, CEO), lenguaje decisorio ("yo decido", "puedo aprobar"), pronombres (yo/nosotros)
5. Para castellano de España: reconoce "vosotros", "ordenador" (no "computadora"), "móvil" (no "celular")

Responde SOLO con el JSON, sin texto adicional.`;
  }

  /**
   * Parse Grok response into structured analysis
   */
  private parseAnalysisResponse(response: string): MessageAnalysis {
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(response);

      // Validate and return
      return {
        entities: parsed.entities || [],
        sentiment: parsed.sentiment || { score: 0, label: 'neutral', confidence: 0.5, reasoning: '' },
        formality: parsed.formality || { formality: 'formal', confidence: 0.5, markers: [] },
        budgetSignals: parsed.budgetSignals || {
          hasExplicitBudget: false,
          budgetIndicators: [],
          confidence: 0.5,
          meetsMinimum: false
        },
        spocAvailability: parsed.spocAvailability || {
          hasDesignatedContact: false,
          availabilityIndicators: [],
          confidence: 0.5,
          meetsMinimum: false
        },
        digitalMaturity: parsed.digitalMaturity || {
          maturityLevel: 'medium',
          indicators: [],
          hasCurrentTools: false,
          hasProcesses: false,
          hasTechnicalTeam: false,
          confidence: 0.5
        },
        authoritySignals: parsed.authoritySignals || {
          authorityLevel: 'information-gatherer',
          decisionProcess: 'unknown',
          confidence: 0.5
        },
        urgencySignals: parsed.urgencySignals || {
          urgencyLevel: 'medium',
          indicators: [],
          confidence: 0.5
        },
        confusionLevel: parsed.confusionLevel || 0,
        frustrationLevel: parsed.frustrationLevel || 0,
        keyInsights: parsed.keyInsights || []
      };
    } catch (error) {
      console.error('Failed to parse Grok response:', error);
      console.error('Response was:', response);
      return this.getFallbackAnalysis('');
    }
  }

  /**
   * Fallback analysis when Grok fails
   */
  private getFallbackAnalysis(text: string): MessageAnalysis {
    const textLower = text.toLowerCase();

    // Simple keyword-based fallback
    const hasBudgetKeywords = /presupuesto|inversión|euros|€|coste|precio/i.test(text);
    const hasAvailabilityKeywords = /disponible|tiempo|reunión|horas|dedicar/i.test(text);
    const hasFormalMarkers = /usted|señor|señora|estimado/i.test(text);

    return {
      entities: [],
      sentiment: {
        score: 0,
        label: 'neutral',
        confidence: 0.3,
        reasoning: 'Análisis de respaldo (Grok no disponible)'
      },
      formality: {
        formality: hasFormalMarkers ? 'formal' : 'informal',
        confidence: 0.5,
        markers: []
      },
      budgetSignals: {
        hasExplicitBudget: false,
        budgetIndicators: hasBudgetKeywords ? ['keywords detected'] : [],
        confidence: 0.3,
        meetsMinimum: false
      },
      spocAvailability: {
        hasDesignatedContact: false,
        availabilityIndicators: hasAvailabilityKeywords ? ['keywords detected'] : [],
        confidence: 0.3,
        meetsMinimum: false
      },
      digitalMaturity: {
        maturityLevel: 'medium',
        indicators: [],
        hasCurrentTools: false,
        hasProcesses: false,
        hasTechnicalTeam: false,
        confidence: 0.3
      },
      authoritySignals: {
        authorityLevel: 'information-gatherer',
        decisionProcess: 'unknown',
        confidence: 0.3
      },
      urgencySignals: {
        urgencyLevel: 'medium',
        indicators: [],
        confidence: 0.3
      },
      confusionLevel: 0,
      frustrationLevel: 0,
      keyInsights: ['Análisis limitado - servicio NLP no disponible']
    };
  }

  /**
   * Quick sentiment check (for acknowledgments in MessageComposer)
   */
  async quickSentiment(text: string): Promise<'positive' | 'negative' | 'neutral'> {
    // Use simple keyword matching for speed
    const positive = ['excelente', 'perfecto', 'genial', 'bien', 'sí', 'vale', 'de acuerdo'];
    const negative = ['no', 'problema', 'difícil', 'imposible', 'complicado'];

    const textLower = text.toLowerCase();
    const posCount = positive.filter(w => textLower.includes(w)).length;
    const negCount = negative.filter(w => textLower.includes(w)).length;

    if (posCount > negCount) return 'positive';
    if (negCount > posCount) return 'negative';
    return 'neutral';
  }

  /**
   * Quick formality check (for MessageComposer)
   */
  async quickFormality(text: string): Promise<'formal' | 'informal'> {
    const textLower = text.toLowerCase();

    if (textLower.includes('usted') || textLower.includes('señor') || textLower.includes('señora')) {
      return 'formal';
    }
    if (textLower.includes('tú') || textLower.includes('vosotros')) {
      return 'informal';
    }

    // Default to formal for B2B
    return 'formal';
  }
}

// Export singleton
export const grokNLPService = new GrokNLPService();