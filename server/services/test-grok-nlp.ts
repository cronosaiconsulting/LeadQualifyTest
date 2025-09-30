// Quick test for Grok NLP service
// Run with: npx tsx server/services/test-grok-nlp.ts

import { grokNLPService } from './grok-nlp';

async function testGrokNLP() {
  console.log('Testing Grok NLP Service with Castilian Spanish...\n');

  const testMessages = [
    {
      text: 'Hola, somos una empresa de 25 empleados y tenemos un presupuesto de unos 8.000€ para digitalización',
      expected: 'Budget: ≥5K€, Company size, Medium maturity likely'
    },
    {
      text: 'Nuestro director de operaciones puede dedicar 5 horas semanales a este proyecto',
      expected: 'SPOC: ≥4hrs/week, Authority signals'
    },
    {
      text: 'Usamos un CRM básico y tenemos procesos documentados pero necesitamos mejorar',
      expected: 'Digital maturity: Medium (tools + processes)'
    },
    {
      text: 'Solo tengo 2.000€ y no dispongo de mucho tiempo',
      expected: 'Budget: <5K€, SPOC: insufficient time - DISQUALIFY'
    }
  ];

  for (const { text, expected } of testMessages) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Message: "${text}"`);
    console.log(`Expected: ${expected}`);
    console.log('-'.repeat(80));

    try {
      const analysis = await grokNLPService.analyzeMessage(text);

      console.log('\n📊 Budget Signals:');
      console.log(`  - Explicit budget: ${analysis.budgetSignals.hasExplicitBudget}`);
      console.log(`  - Estimated: ${analysis.budgetSignals.estimatedBudget || 'N/A'}€`);
      console.log(`  - Meets 5K minimum: ${analysis.budgetSignals.meetsMinimum ? '✅' : '❌'}`);
      console.log(`  - Confidence: ${(analysis.budgetSignals.confidence * 100).toFixed(0)}%`);
      console.log(`  - Indicators: ${analysis.budgetSignals.budgetIndicators.join(', ') || 'none'}`);

      console.log('\n⏰ SPOC Availability:');
      console.log(`  - Designated contact: ${analysis.spocAvailability.hasDesignatedContact}`);
      console.log(`  - Hours/week: ${analysis.spocAvailability.estimatedHoursPerWeek || 'N/A'}`);
      console.log(`  - Meets 4hr minimum: ${analysis.spocAvailability.meetsMinimum ? '✅' : '❌'}`);
      console.log(`  - Confidence: ${(analysis.spocAvailability.confidence * 100).toFixed(0)}%`);
      console.log(`  - Indicators: ${analysis.spocAvailability.availabilityIndicators.join(', ') || 'none'}`);

      console.log('\n💻 Digital Maturity:');
      console.log(`  - Level: ${analysis.digitalMaturity.maturityLevel.toUpperCase()}`);
      console.log(`  - Has tools: ${analysis.digitalMaturity.hasCurrentTools ? '✅' : '❌'}`);
      console.log(`  - Has processes: ${analysis.digitalMaturity.hasProcesses ? '✅' : '❌'}`);
      console.log(`  - Has tech team: ${analysis.digitalMaturity.hasTechnicalTeam ? '✅' : '❌'}`);
      console.log(`  - Confidence: ${(analysis.digitalMaturity.confidence * 100).toFixed(0)}%`);
      console.log(`  - Indicators: ${analysis.digitalMaturity.indicators.join(', ') || 'none'}`);

      console.log('\n🎯 Overall Assessment:');
      console.log(`  - Sentiment: ${analysis.sentiment.label} (${(analysis.sentiment.score * 100).toFixed(0)}%)`);
      console.log(`  - Authority: ${analysis.authoritySignals.authorityLevel}`);
      console.log(`  - Urgency: ${analysis.urgencySignals.urgencyLevel}`);
      console.log(`  - Key insights: ${analysis.keyInsights.join(' | ')}`);

      // Calculate fit score
      const budgetScore = analysis.budgetSignals.meetsMinimum ? 0.9 : 0.2;
      const spocScore = analysis.spocAvailability.meetsMinimum ? 0.9 : 0.3;
      const maturityScore = analysis.digitalMaturity.maturityLevel === 'medium' ? 0.7 :
                           analysis.digitalMaturity.maturityLevel === 'high' ? 0.9 : 0.3;
      const fitScore = (budgetScore * 0.4 + spocScore * 0.3 + maturityScore * 0.3);

      console.log(`\n🏆 SMB Fit Score: ${(fitScore * 100).toFixed(0)}%`);
      if (fitScore >= 0.7) {
        console.log('   ✅ HIGH PRIORITY LEAD - Move to proposal');
      } else if (fitScore >= 0.5) {
        console.log('   ⚠️  Continue qualifying - gaps exist');
      } else {
        console.log('   ❌ DISQUALIFY - does not meet minimum criteria');
      }

    } catch (error: any) {
      console.error('\n❌ Error:', error.message);
      console.error('   This is expected if XAI_API_KEY is not configured');
    }
  }

  console.log(`\n${'='.repeat(80)}\n`);
  console.log('Test complete. If you see "XAI_API_KEY is not configured" errors, that\'s expected.');
  console.log('Add XAI_API_KEY to your .env file to test with real Grok API calls.\n');
}

// Run tests
testGrokNLP().catch(console.error);