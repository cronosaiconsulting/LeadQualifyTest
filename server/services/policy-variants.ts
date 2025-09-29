import type { ExperimentVariant } from "@shared/schema";

export interface PolicyConfig {
  policyType: 'thompson_sampling' | 'epsilon_greedy' | 'cultural_adapted' | 'budget_focused';
  
  // Question selection strategy parameters
  explorationParams: {
    explorationRate?: number; // For epsilon-greedy
    explorationDecay?: number; // Decay rate over time
    uncertaintyWeight?: number; // How much to weight uncertainty in decision
    diversificationFactor?: number; // Encourage diverse questioning
  };
  
  // Metrics weights for qualification scoring
  metricsWeights: {
    budgetInterest: number;
    timelineUrgency: number;
    decisionAuthority: number;
    needSeverity: number;
    competitorPresence: number;
    engagementQuality: number;
    culturalFit: number;
  };
  
  // Qualification thresholds
  qualificationThresholds: {
    minOverallScore: number;
    budgetMinimum: number;
    timelineMaxMonths: number;
    authorityRequired: boolean;
    culturalAlignmentMin?: number;
  };
  
  // Cultural adaptation parameters
  culturalAdaptations: {
    communicationStyle: 'direct' | 'indirect' | 'adaptive';
    formalityLevel: 'formal' | 'casual' | 'context_based';
    responseTimeExpectation: number; // minutes
    questionDepthPreference: 'shallow' | 'medium' | 'deep';
    relationshipBuildingEmphasis: number; // 0-1 scale
    
    // LATAM-specific adaptations
    latinAmericaAdaptations?: {
      relationshipFirstApproach: boolean;
      extendedFamilyConsideration: boolean;
      hierarchyRespectLevel: number; // 0-1 scale
      personalConnectionImportance: number; // 0-1 scale
      decisionTimelineFlexibility: number; // Multiplier for timeline tolerance
    };
  };
  
  // Budget detection configuration
  budgetDetection: {
    targetBudgetRange: { min: number; max: number };
    indirectDetectionMethods: string[];
    confidenceThreshold: number;
    escalationStrategy: 'direct_ask' | 'gradual_probe' | 'context_inference';
    
    // Specific algorithms for ~$10k consulting deals
    consultingBudgetAlgorithm: {
      companySize: 'startup' | 'sme' | 'enterprise' | 'mixed';
      projectScope: 'tactical' | 'strategic' | 'transformation';
      urgencyMultiplier: number;
      competitionAwareness: boolean;
    };
  };
  
  // Learning and adaptation parameters
  learningConfig: {
    adaptationRate: number; // How quickly to update beliefs
    forgettingFactor: number; // Weight decay for old observations
    minimumSampleSize: number; // Before making adaptations
    confidenceRequirement: number; // Minimum confidence for decisions
    
    // Thompson sampling specific
    thompsonSampling?: {
      priorAlpha: number;
      priorBeta: number;
      updateMethod: 'bayesian' | 'frequentist';
      varianceAdjustment: number;
    };
  };
}

export interface PolicyVariant {
  id: string;
  name: string;
  description: string;
  config: PolicyConfig;
  isControl: boolean;
  targetScenarios: string[];
  expectedOutcomes: {
    qualificationAccuracy: number;
    conversionRate: number;
    engagementScore: number;
    culturalAlignment: number;
  };
}

export class PolicyVariantService {
  /**
   * Generate policy variants for different testing scenarios
   */
  generateExplorationVsExploitationVariants(): PolicyVariant[] {
    return [
      {
        id: 'exploration-heavy',
        name: 'High Exploration Strategy',
        description: 'Emphasizes discovery of new information over exploiting known patterns',
        isControl: false,
        config: {
          policyType: 'epsilon_greedy',
          explorationParams: {
            explorationRate: 0.3,
            explorationDecay: 0.95,
            uncertaintyWeight: 0.8,
            diversificationFactor: 0.7
          },
          metricsWeights: this.getBalancedMetricsWeights(),
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: this.getStandardBudgetDetection(),
          learningConfig: {
            adaptationRate: 0.2,
            forgettingFactor: 0.98,
            minimumSampleSize: 20,
            confidenceRequirement: 0.6
          }
        },
        targetScenarios: ['early_conversation', 'uncertain_context', 'new_market_segments'],
        expectedOutcomes: {
          qualificationAccuracy: 0.75,
          conversionRate: 0.35,
          engagementScore: 0.8,
          culturalAlignment: 0.7
        }
      },
      {
        id: 'exploitation-focused',
        name: 'Exploitation Focused Strategy',
        description: 'Leverages proven patterns and high-confidence decisions',
        isControl: false,
        config: {
          policyType: 'epsilon_greedy',
          explorationParams: {
            explorationRate: 0.1,
            explorationDecay: 0.99,
            uncertaintyWeight: 0.3,
            diversificationFactor: 0.2
          },
          metricsWeights: this.getBalancedMetricsWeights(),
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: this.getStandardBudgetDetection(),
          learningConfig: {
            adaptationRate: 0.1,
            forgettingFactor: 0.95,
            minimumSampleSize: 50,
            confidenceRequirement: 0.8
          }
        },
        targetScenarios: ['mature_conversations', 'proven_patterns', 'high_confidence_contexts'],
        expectedOutcomes: {
          qualificationAccuracy: 0.85,
          conversionRate: 0.45,
          engagementScore: 0.75,
          culturalAlignment: 0.8
        }
      },
      {
        id: 'adaptive-balance',
        name: 'Adaptive Exploration-Exploitation',
        description: 'Dynamically balances exploration and exploitation based on context',
        isControl: true,
        config: {
          policyType: 'thompson_sampling',
          explorationParams: {
            explorationRate: 0.2,
            explorationDecay: 0.97,
            uncertaintyWeight: 0.5,
            diversificationFactor: 0.4
          },
          metricsWeights: this.getBalancedMetricsWeights(),
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: this.getStandardBudgetDetection(),
          learningConfig: {
            adaptationRate: 0.15,
            forgettingFactor: 0.97,
            minimumSampleSize: 30,
            confidenceRequirement: 0.7,
            thompsonSampling: {
              priorAlpha: 1,
              priorBeta: 1,
              updateMethod: 'bayesian',
              varianceAdjustment: 1.0
            }
          }
        },
        targetScenarios: ['all_scenarios'],
        expectedOutcomes: {
          qualificationAccuracy: 0.8,
          conversionRate: 0.4,
          engagementScore: 0.77,
          culturalAlignment: 0.75
        }
      }
    ];
  }

  /**
   * Generate variants with different metrics weights
   */
  generateMetricsWeightVariants(): PolicyVariant[] {
    return [
      {
        id: 'budget-focused',
        name: 'Budget-Focused Qualification',
        description: 'Heavily weights budget qualification over other factors',
        isControl: false,
        config: {
          policyType: 'budget_focused',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: {
            budgetInterest: 0.4,
            timelineUrgency: 0.15,
            decisionAuthority: 0.15,
            needSeverity: 0.1,
            competitorPresence: 0.05,
            engagementQuality: 0.1,
            culturalFit: 0.05
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            budgetMinimum: 8000,
            minOverallScore: 0.65
          },
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: {
            ...this.getStandardBudgetDetection(),
            confidenceThreshold: 0.8,
            escalationStrategy: 'gradual_probe'
          },
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['budget_sensitive', 'cost_conscious_clients'],
        expectedOutcomes: {
          qualificationAccuracy: 0.82,
          conversionRate: 0.38,
          engagementScore: 0.7,
          culturalAlignment: 0.65
        }
      },
      {
        id: 'relationship-first',
        name: 'Relationship-First Approach',
        description: 'Prioritizes engagement and cultural fit before qualification',
        isControl: false,
        config: {
          policyType: 'cultural_adapted',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: {
            budgetInterest: 0.15,
            timelineUrgency: 0.1,
            decisionAuthority: 0.1,
            needSeverity: 0.15,
            competitorPresence: 0.05,
            engagementQuality: 0.3,
            culturalFit: 0.25
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            minOverallScore: 0.6,
            culturalAlignmentMin: 0.7
          },
          culturalAdaptations: {
            ...this.getStandardCulturalAdaptations(),
            relationshipBuildingEmphasis: 0.8,
            latinAmericaAdaptations: {
              relationshipFirstApproach: true,
              extendedFamilyConsideration: true,
              hierarchyRespectLevel: 0.8,
              personalConnectionImportance: 0.9,
              decisionTimelineFlexibility: 1.5
            }
          },
          budgetDetection: this.getStandardBudgetDetection(),
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['latam_clients', 'relationship_cultures', 'trust_building_required'],
        expectedOutcomes: {
          qualificationAccuracy: 0.75,
          conversionRate: 0.42,
          engagementScore: 0.88,
          culturalAlignment: 0.9
        }
      },
      {
        id: 'urgency-optimized',
        name: 'Urgency-Optimized Qualification',
        description: 'Optimizes for timeline urgency and decision authority',
        isControl: false,
        config: {
          policyType: 'epsilon_greedy',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: {
            budgetInterest: 0.2,
            timelineUrgency: 0.35,
            decisionAuthority: 0.25,
            needSeverity: 0.1,
            competitorPresence: 0.05,
            engagementQuality: 0.03,
            culturalFit: 0.02
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            timelineMaxMonths: 3,
            authorityRequired: true,
            minOverallScore: 0.7
          },
          culturalAdaptations: {
            ...this.getStandardCulturalAdaptations(),
            communicationStyle: 'direct',
            responseTimeExpectation: 30
          },
          budgetDetection: {
            ...this.getStandardBudgetDetection(),
            escalationStrategy: 'direct_ask'
          },
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['urgent_projects', 'quick_decisions', 'time_sensitive'],
        expectedOutcomes: {
          qualificationAccuracy: 0.78,
          conversionRate: 0.35,
          engagementScore: 0.65,
          culturalAlignment: 0.6
        }
      }
    ];
  }

  /**
   * Generate LATAM cultural context variants
   */
  generateCulturalContextVariants(): PolicyVariant[] {
    return [
      {
        id: 'latam-standard',
        name: 'Standard LATAM Adaptation',
        description: 'Balanced approach for Spanish-speaking LATAM markets',
        isControl: false,
        config: {
          policyType: 'cultural_adapted',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: {
            budgetInterest: 0.2,
            timelineUrgency: 0.15,
            decisionAuthority: 0.15,
            needSeverity: 0.2,
            competitorPresence: 0.1,
            engagementQuality: 0.15,
            culturalFit: 0.05
          },
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: {
            communicationStyle: 'adaptive',
            formalityLevel: 'context_based',
            responseTimeExpectation: 120,
            questionDepthPreference: 'medium',
            relationshipBuildingEmphasis: 0.6,
            latinAmericaAdaptations: {
              relationshipFirstApproach: true,
              extendedFamilyConsideration: false,
              hierarchyRespectLevel: 0.7,
              personalConnectionImportance: 0.7,
              decisionTimelineFlexibility: 1.3
            }
          },
          budgetDetection: {
            ...this.getStandardBudgetDetection(),
            escalationStrategy: 'context_inference'
          },
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['spanish_latam', 'medium_formality'],
        expectedOutcomes: {
          qualificationAccuracy: 0.78,
          conversionRate: 0.4,
          engagementScore: 0.82,
          culturalAlignment: 0.85
        }
      },
      {
        id: 'latam-high-context',
        name: 'High-Context LATAM Approach',
        description: 'Deep cultural adaptation for relationship-centric markets',
        isControl: false,
        config: {
          policyType: 'cultural_adapted',
          explorationParams: {
            ...this.getStandardExplorationParams(),
            uncertaintyWeight: 0.6 // Higher uncertainty tolerance
          },
          metricsWeights: {
            budgetInterest: 0.15,
            timelineUrgency: 0.1,
            decisionAuthority: 0.1,
            needSeverity: 0.2,
            competitorPresence: 0.05,
            engagementQuality: 0.25,
            culturalFit: 0.15
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            minOverallScore: 0.55,
            timelineMaxMonths: 8,
            culturalAlignmentMin: 0.8
          },
          culturalAdaptations: {
            communicationStyle: 'indirect',
            formalityLevel: 'formal',
            responseTimeExpectation: 180,
            questionDepthPreference: 'deep',
            relationshipBuildingEmphasis: 0.9,
            latinAmericaAdaptations: {
              relationshipFirstApproach: true,
              extendedFamilyConsideration: true,
              hierarchyRespectLevel: 0.9,
              personalConnectionImportance: 0.95,
              decisionTimelineFlexibility: 2.0
            }
          },
          budgetDetection: {
            ...this.getStandardBudgetDetection(),
            confidenceThreshold: 0.6,
            escalationStrategy: 'context_inference'
          },
          learningConfig: {
            ...this.getStandardLearningConfig(),
            adaptationRate: 0.1, // Slower adaptation
            minimumSampleSize: 40
          }
        },
        targetScenarios: ['traditional_markets', 'family_businesses', 'high_formality'],
        expectedOutcomes: {
          qualificationAccuracy: 0.72,
          conversionRate: 0.45,
          engagementScore: 0.9,
          culturalAlignment: 0.95
        }
      },
      {
        id: 'latam-digital-native',
        name: 'Digital-Native LATAM Approach',
        description: 'Adapted for younger, tech-forward LATAM businesses',
        isControl: false,
        config: {
          policyType: 'epsilon_greedy',
          explorationParams: {
            ...this.getStandardExplorationParams(),
            explorationRate: 0.25
          },
          metricsWeights: {
            budgetInterest: 0.25,
            timelineUrgency: 0.2,
            decisionAuthority: 0.2,
            needSeverity: 0.15,
            competitorPresence: 0.05,
            engagementQuality: 0.1,
            culturalFit: 0.05
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            timelineMaxMonths: 4,
            minOverallScore: 0.7
          },
          culturalAdaptations: {
            communicationStyle: 'direct',
            formalityLevel: 'casual',
            responseTimeExpectation: 60,
            questionDepthPreference: 'shallow',
            relationshipBuildingEmphasis: 0.4,
            latinAmericaAdaptations: {
              relationshipFirstApproach: false,
              extendedFamilyConsideration: false,
              hierarchyRespectLevel: 0.4,
              personalConnectionImportance: 0.5,
              decisionTimelineFlexibility: 1.1
            }
          },
          budgetDetection: {
            ...this.getStandardBudgetDetection(),
            escalationStrategy: 'direct_ask'
          },
          learningConfig: {
            ...this.getStandardLearningConfig(),
            adaptationRate: 0.2
          }
        },
        targetScenarios: ['tech_companies', 'startups', 'young_leadership'],
        expectedOutcomes: {
          qualificationAccuracy: 0.8,
          conversionRate: 0.38,
          engagementScore: 0.75,
          culturalAlignment: 0.7
        }
      }
    ];
  }

  /**
   * Generate budget detection algorithm variants
   */
  generateBudgetDetectionVariants(): PolicyVariant[] {
    return [
      {
        id: 'budget-gradual-probe',
        name: 'Gradual Budget Probing',
        description: 'Gradually approaches budget through context and indirect signals',
        isControl: false,
        config: {
          policyType: 'budget_focused',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: this.getBalancedMetricsWeights(),
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: {
            targetBudgetRange: { min: 8000, max: 15000 },
            indirectDetectionMethods: [
              'company_size_inference',
              'project_scope_analysis',
              'competitor_spending_patterns',
              'timeline_urgency_correlation'
            ],
            confidenceThreshold: 0.7,
            escalationStrategy: 'gradual_probe',
            consultingBudgetAlgorithm: {
              companySize: 'sme',
              projectScope: 'strategic',
              urgencyMultiplier: 1.2,
              competitionAwareness: true
            }
          },
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['budget_sensitive', 'conservative_clients'],
        expectedOutcomes: {
          qualificationAccuracy: 0.8,
          conversionRate: 0.42,
          engagementScore: 0.8,
          culturalAlignment: 0.75
        }
      },
      {
        id: 'budget-direct-approach',
        name: 'Direct Budget Inquiry',
        description: 'Direct approach to budget qualification with value justification',
        isControl: false,
        config: {
          policyType: 'budget_focused',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: {
            ...this.getBalancedMetricsWeights(),
            budgetInterest: 0.4
          },
          qualificationThresholds: {
            ...this.getStandardThresholds(),
            budgetMinimum: 10000
          },
          culturalAdaptations: {
            ...this.getStandardCulturalAdaptations(),
            communicationStyle: 'direct'
          },
          budgetDetection: {
            targetBudgetRange: { min: 10000, max: 20000 },
            indirectDetectionMethods: [
              'value_proposition_response',
              'price_objection_handling'
            ],
            confidenceThreshold: 0.8,
            escalationStrategy: 'direct_ask',
            consultingBudgetAlgorithm: {
              companySize: 'mixed',
              projectScope: 'transformation',
              urgencyMultiplier: 1.0,
              competitionAwareness: true
            }
          },
          learningConfig: this.getStandardLearningConfig()
        },
        targetScenarios: ['direct_cultures', 'time_efficient'],
        expectedOutcomes: {
          qualificationAccuracy: 0.85,
          conversionRate: 0.35,
          engagementScore: 0.7,
          culturalAlignment: 0.65
        }
      },
      {
        id: 'budget-context-inference',
        name: 'Context-Based Budget Inference',
        description: 'Infers budget through comprehensive context analysis',
        isControl: true,
        config: {
          policyType: 'thompson_sampling',
          explorationParams: this.getStandardExplorationParams(),
          metricsWeights: this.getBalancedMetricsWeights(),
          qualificationThresholds: this.getStandardThresholds(),
          culturalAdaptations: this.getStandardCulturalAdaptations(),
          budgetDetection: {
            targetBudgetRange: { min: 8000, max: 12000 },
            indirectDetectionMethods: [
              'company_revenue_signals',
              'industry_benchmarks',
              'problem_severity_correlation',
              'decision_maker_level',
              'competitive_landscape',
              'growth_stage_indicators'
            ],
            confidenceThreshold: 0.75,
            escalationStrategy: 'context_inference',
            consultingBudgetAlgorithm: {
              companySize: 'sme',
              projectScope: 'strategic',
              urgencyMultiplier: 1.1,
              competitionAwareness: true
            }
          },
          learningConfig: {
            ...this.getStandardLearningConfig(),
            thompsonSampling: {
              priorAlpha: 1,
              priorBeta: 1,
              updateMethod: 'bayesian',
              varianceAdjustment: 1.0
            }
          }
        },
        targetScenarios: ['context_rich', 'indirect_cultures'],
        expectedOutcomes: {
          qualificationAccuracy: 0.78,
          conversionRate: 0.4,
          engagementScore: 0.8,
          culturalAlignment: 0.8
        }
      }
    ];
  }

  /**
   * Create a comprehensive experiment with multiple policy variants
   */
  createComprehensiveExperiment(experimentType: string): PolicyVariant[] {
    switch (experimentType) {
      case 'exploration_vs_exploitation':
        return this.generateExplorationVsExploitationVariants();
      
      case 'metrics_weights':
        return this.generateMetricsWeightVariants();
      
      case 'cultural_context':
        return this.generateCulturalContextVariants();
      
      case 'budget_detection':
        return this.generateBudgetDetectionVariants();
      
      case 'comprehensive':
        return [
          ...this.generateExplorationVsExploitationVariants(),
          ...this.generateMetricsWeightVariants(),
          ...this.generateCulturalContextVariants(),
          ...this.generateBudgetDetectionVariants()
        ];
      
      default:
        throw new Error(`Unknown experiment type: ${experimentType}`);
    }
  }

  /**
   * Validate policy configuration
   */
  validatePolicyConfig(config: PolicyConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate metrics weights sum to 1
    const weightSum = Object.values(config.metricsWeights).reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      errors.push(`Metrics weights must sum to 1.0 (current: ${weightSum.toFixed(3)})`);
    }

    // Validate exploration parameters
    if (config.explorationParams.explorationRate !== undefined) {
      if (config.explorationParams.explorationRate < 0 || config.explorationParams.explorationRate > 1) {
        errors.push('Exploration rate must be between 0 and 1');
      }
    }

    // Validate thresholds
    if (config.qualificationThresholds.minOverallScore < 0 || config.qualificationThresholds.minOverallScore > 1) {
      errors.push('Minimum overall score must be between 0 and 1');
    }

    if (config.qualificationThresholds.budgetMinimum < 0) {
      errors.push('Budget minimum cannot be negative');
    }

    // Validate cultural adaptations
    if (config.culturalAdaptations.relationshipBuildingEmphasis < 0 || 
        config.culturalAdaptations.relationshipBuildingEmphasis > 1) {
      errors.push('Relationship building emphasis must be between 0 and 1');
    }

    // Validate learning config
    if (config.learningConfig.adaptationRate < 0 || config.learningConfig.adaptationRate > 1) {
      errors.push('Adaptation rate must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Helper methods for generating standard configurations

  private getStandardExplorationParams() {
    return {
      explorationRate: 0.2,
      explorationDecay: 0.97,
      uncertaintyWeight: 0.5,
      diversificationFactor: 0.4
    };
  }

  private getBalancedMetricsWeights() {
    return {
      budgetInterest: 0.2,
      timelineUrgency: 0.15,
      decisionAuthority: 0.15,
      needSeverity: 0.2,
      competitorPresence: 0.1,
      engagementQuality: 0.15,
      culturalFit: 0.05
    };
  }

  private getStandardThresholds() {
    return {
      minOverallScore: 0.7,
      budgetMinimum: 8000,
      timelineMaxMonths: 6,
      authorityRequired: false
    };
  }

  private getStandardCulturalAdaptations() {
    return {
      communicationStyle: 'adaptive' as const,
      formalityLevel: 'context_based' as const,
      responseTimeExpectation: 90,
      questionDepthPreference: 'medium' as const,
      relationshipBuildingEmphasis: 0.5
    };
  }

  private getStandardBudgetDetection() {
    return {
      targetBudgetRange: { min: 8000, max: 12000 },
      indirectDetectionMethods: [
        'company_size_inference',
        'project_scope_analysis',
        'timeline_urgency_correlation'
      ],
      confidenceThreshold: 0.75,
      escalationStrategy: 'gradual_probe' as const,
      consultingBudgetAlgorithm: {
        companySize: 'sme' as const,
        projectScope: 'strategic' as const,
        urgencyMultiplier: 1.1,
        competitionAwareness: true
      }
    };
  }

  private getStandardLearningConfig() {
    return {
      adaptationRate: 0.15,
      forgettingFactor: 0.97,
      minimumSampleSize: 30,
      confidenceRequirement: 0.7
    };
  }
}

export const policyVariantService = new PolicyVariantService();