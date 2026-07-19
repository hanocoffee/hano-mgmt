import type { StoredDocument } from '../core/types.js';
import { documentAnalysisText } from '../core/types.js';

/** Bump when the prompt changes in a way that affects output. Stored with each pain point. */
export const EXTRACT_PAIN_PROMPT_VERSION = 'extract-pain@2';

export const EXTRACT_PAIN_SYSTEM_PROMPT = `You are a market researcher extracting concrete pain points from raw documents (posts, reviews, articles).

Respond with ONLY a JSON object of this exact shape:
{
  "painPoints": [
    {
      "problemStatement": "one sentence describing the problem, in Japanese",
      "targetUser": "who has this problem (role/segment), in Japanese",
      "context": "situation in which the problem occurs, in Japanese",
      "currentWorkaround": "how they solve it today, in Japanese ('不明' if not stated)",
      "desiredOutcome": "what a solution would achieve for them, in Japanese",
      "clusterKey": "short-english-kebab-case-key naming the underlying problem, stable across documents describing the same problem (e.g. 'manual-inventory-tracking')",
      "evidence": [
        {
          "evidenceText": "VERBATIM quote copied from the document, in its original language",
          "evidenceType": "quote" | "complaint" | "workaround" | "pricing" | "other"
        }
      ]
    }
  ]
}

Rules:
- One document often contains MULTIPLE distinct problems (e.g. missed calls AND unanswered DMs AND double bookings). Extract each as its own pain point, up to 3. Return {"painPoints": []} if the document contains none.
- Base extraction on the ORIGINAL QUOTE (the poster's own words) when provided; the summary is context only and must never be used as evidence.
- evidenceText MUST be copied verbatim from the original quote / document text. Never paraphrase or invent evidence.
- clusterKey names the UNDERLYING problem, not this specific post: reuse general keys like "invoice-payment-collection" or "missed-customer-inquiries" so the same problem from different posts gets the same key.
- Only extract problems actually present in the text. Do not speculate.
- A pain point without at least one evidence quote must not be returned.`;

export function buildExtractPainUserMessage(
  document: StoredDocument,
  maxContentChars = 4000,
): string {
  const header =
    `Document (source=${document.sourceId}, url=${document.url ?? 'n/a'}, ` +
    `published=${document.publishedAt ?? 'unknown'}):\n` +
    `Title: ${document.title}\n`;
  const quote = document.originalQuote
    ? `\nOriginal quote (poster's own words — use this for extraction and evidence):\n"${document.originalQuote.slice(0, maxContentChars)}"\n`
    : '';
  const summary = document.summary
    ? `\nSummary (context only, NOT usable as evidence):\n${document.summary.slice(0, 500)}\n`
    : '';
  const body = document.originalQuote
    ? ''
    : `\n${documentAnalysisText(document).slice(0, maxContentChars)}`;
  return `${header}${quote}${summary}${body}`;
}
