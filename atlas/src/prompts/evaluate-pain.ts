import type { EvidenceRef } from '../core/analyzer.js';
import type { ExtractedPainPoint } from '../core/types.js';

/** Bump when the prompt changes in a way that affects output. Stored with each pain point. */
export const EVALUATE_PAIN_PROMPT_VERSION = 'evaluate-pain@1';

export const EVALUATE_PAIN_SYSTEM_PROMPT = `You are a business analyst evaluating whether a pain point is a commercially viable opportunity for a solo/small AI-powered business.

Respond with ONLY a JSON object of this exact shape:
{
  "scores": {
    "severity":         { "score": 0.0-1.0, "reason": "...", "evidenceIds": ["e1"] },
    "frequency":        { "score": 0.0-1.0, "reason": "...", "evidenceIds": [] },
    "willingnessToPay": { "score": 0.0-1.0, "reason": "...", "evidenceIds": [] },
    "automationFit":    { "score": 0.0-1.0, "reason": "...", "evidenceIds": [] },
    "reachability":     { "score": 0.0-1.0, "reason": "...", "evidenceIds": [] },
    "evidenceQuality":  { "score": 0.0-1.0, "reason": "...", "evidenceIds": [] }
  },
  "confidence": 0.0-1.0,
  "reasoningSummary": "3-4 sentence overall assessment, in Japanese",
  "businessIdeas": [
    {
      "name": "product name idea",
      "valueProposition": "one sentence, in Japanese",
      "productType": "e.g. saas-tool | api | report-service | agent",
      "targetCustomer": "who pays, in Japanese",
      "suggestedPriceModel": "e.g. monthly-subscription | one-time | usage-based",
      "acquisitionChannel": "how to reach the first customers, in Japanese",
      "deliveryMethod": "e.g. web-app | cli | email-report | manual-service",
      "humanWorkRequired": "what a human still has to do, in Japanese",
      "estimatedBuildComplexity": "low" | "medium" | "high",
      "validationMethod": "cheapest way to test demand, in Japanese"
    }
  ]
}

Scoring rubric (0 = not at all, 1 = extremely):
- severity: how large is the loss/inconvenience if unsolved
- frequency: does the problem recur (daily/weekly beats yearly)
- willingnessToPay: are they ALREADY spending money or significant time on it
- automationFit: can AI/software solve most of it without humans
- reachability: can the target users be reached cheaply (communities, SEO, existing audience)
- evidenceQuality: is there concrete first-person evidence, ideally from multiple people

Rules:
- Every score MUST include a concrete reason.
- Reference evidence by the provided IDs (e.g. "e1"). Do not invent IDs.
- Any score above 0.5 MUST cite at least one evidenceId. Unsupported claims get low scores.
- Generate 0-2 business ideas. No idea is better than a forced one.
- reason fields: Japanese preferred.`;

export function buildEvaluatePainUserMessage(
  painPoint: ExtractedPainPoint,
  evidence: EvidenceRef[],
): string {
  const evidenceBlock =
    evidence.length > 0
      ? evidence
          .map((item) => `${item.id} (${item.evidenceType}): "${item.evidenceText}"`)
          .join('\n')
      : '(no evidence provided)';
  return `Pain point:
- problem: ${painPoint.problemStatement}
- target user: ${painPoint.targetUser}
- context: ${painPoint.context}
- current workaround: ${painPoint.currentWorkaround}
- desired outcome: ${painPoint.desiredOutcome}

Evidence:
${evidenceBlock}`;
}
