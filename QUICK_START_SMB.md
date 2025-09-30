# Quick Start: SMB Consulting Metrics

## TL;DR

New Grok-based lead qualification for SMB consulting:
- ✅ Budget ≥ 5,000€
- ✅ SPOC ≥ 4 hours/week
- ✅ Medium digital maturity

**Fit Score ≥ 0.7 = Qualified Lead**

---

## Setup (2 minutes)

1. **Add API key to `.env`**:
```bash
echo "XAI_API_KEY=xai-your-key-here" >> .env
```

2. **Test it works**:
```bash
npx tsx server/services/test-grok-nlp.ts
```

Expected output:
```
🏆 SMB Fit Score: 82%
   ✅ HIGH PRIORITY LEAD - Move to proposal
```

---

## How It Works

### 1. User sends message in Spanish
```
"Tenemos 8.000€ y nuestro CTO puede dedicar 5 horas semanales"
```

### 2. Grok analyzes it
```typescript
{
  budgetSignals: {
    hasExplicitBudget: true,
    estimatedBudget: 8000,
    meetsMinimum: true  // ≥5,000€ ✅
  },
  spocAvailability: {
    estimatedHoursPerWeek: 5,
    meetsMinimum: true  // ≥4hrs/week ✅
  },
  digitalMaturity: {
    maturityLevel: 'medium',  // ✅
    hasCurrentTools: true
  }
}
```

### 3. System calculates SMB Fit Score
```typescript
smbFitScore = 0.82  // 82% = HIGH PRIORITY LEAD
```

### 4. Decision service acts
- **≥0.8**: Move to proposal immediately
- **0.65-0.8**: Qualified - confirm weak areas
- **0.5-0.65**: Continue qualifying
- **<0.5**: Disqualify

---

## Quick Debug

### Check if Grok is working:
```typescript
// In routes.ts webhook handler
console.log('Grok Analysis:', result.grokAnalysis);
console.log('SMB Fit:', result.metrics.fullMetrics.smb.smbFitScore);
```

### Check database:
```sql
SELECT
  conversation_id,
  full_metrics->'smb'->>'smbFitScore' as fit_score,
  full_metrics->'smb'->>'budgetQualification' as budget,
  full_metrics->'smb'->>'spocAvailability' as spoc
FROM conversation_metrics
ORDER BY updated_at DESC
LIMIT 5;
```

### Test specific message:
```bash
# Edit test-grok-nlp.ts to add your test message
npx tsx server/services/test-grok-nlp.ts
```

---

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `server/services/grok-nlp.ts` | Grok NLP analysis | 343 |
| `server/services/metric-documentation.ts` | SMB metric definitions | +249 |
| `server/services/metrics.ts` | Metric calculation | +150 |
| `server/services/message-composer.ts` | Tone adaptation | +3 |
| `server/services/test-grok-nlp.ts` | Test script | 95 |

---

## Common Issues

### "XAI_API_KEY is not configured"
**Fix**: Add `XAI_API_KEY=xai-...` to `.env` file

### "Grok analysis returned null"
**Fix**: Check API key, check network, check API quota

### "SMB fit score always 0"
**Fix**: Verify Grok analysis is working (`console.log(grokAnalysis)`)

### "Budget not detected"
**Check**: Message contains Spanish budget keywords:
- ✅ "presupuesto de 8.000€"
- ✅ "inversión de 8 mil euros"
- ✅ "tenemos 8K para esto"
- ❌ "budget of $8000" (use Spanish!)

---

## Examples

### ✅ Qualified Lead (Fit: 0.85)
```
Usuario: "Somos una PYME de 30 personas con presupuesto de 10.000€ para
consultoría. Nuestro director de operaciones puede dedicar 6 horas semanales.
Usamos CRM y tenemos procesos documentados."

Analysis:
- Budget: 10K€ ✅ (>5K)
- SPOC: 6hrs/week ✅ (>4hrs)
- Maturity: Medium ✅ (CRM + processes)
- Fit Score: 0.85 → HIGH PRIORITY LEAD
```

### ⚠️ Partial Qualification (Fit: 0.52)
```
Usuario: "Tenemos presupuesto de 7.000€ pero estamos muy ocupados y
empezamos a digitalizar ahora."

Analysis:
- Budget: 7K€ ✅ (>5K)
- SPOC: Unclear ⚠️ ("muy ocupados" = negative signal)
- Maturity: Low ❌ ("empezamos a digitalizar" = low maturity)
- Fit Score: 0.52 → CONTINUE QUALIFYING
```

### ❌ Disqualified (Fit: 0.25)
```
Usuario: "Solo tenemos 2.000€ y no tenemos mucho tiempo disponible."

Analysis:
- Budget: 2K€ ❌ (<5K)
- SPOC: Insufficient ❌ ("no tenemos mucho tiempo")
- Maturity: Unknown ❌
- Fit Score: 0.25 → DISQUALIFY
```

---

## Monitoring

### Track conversion rates:
```sql
-- Qualified leads vs total
SELECT
  COUNT(*) FILTER (WHERE full_metrics->'smb'->>'smbFitScore'::float >= 0.7) as qualified,
  COUNT(*) as total,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE full_metrics->'smb'->>'smbFitScore'::float >= 0.7) / COUNT(*),
    1
  ) as qualification_rate
FROM conversation_metrics
WHERE created_at > NOW() - INTERVAL '7 days';
```

### Average fit score over time:
```sql
SELECT
  DATE(created_at) as date,
  ROUND(AVG((full_metrics->'smb'->>'smbFitScore')::float), 2) as avg_fit_score,
  COUNT(*) as conversations
FROM conversation_metrics
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## Next Steps

1. ✅ Add `XAI_API_KEY` to `.env`
2. ✅ Run test script to verify
3. ⚠️ Test with real WhatsApp conversations
4. ⚠️ Monitor fit scores in dashboard
5. ⚠️ Adjust thresholds based on results

---

## Support

- **Implementation docs**: [SMB_GROK_IMPLEMENTATION.md](SMB_GROK_IMPLEMENTATION.md)
- **Test script**: `npx tsx server/services/test-grok-nlp.ts`
- **Grok service**: [server/services/grok-nlp.ts](server/services/grok-nlp.ts)
- **Metric definitions**: [server/services/metric-documentation.ts](server/services/metric-documentation.ts)