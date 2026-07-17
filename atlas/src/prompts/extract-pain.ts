import type { StoredDocument } from '../core/types.js';

/** Bump when the prompt changes in a way that affects output. Stored with each pain point. */
export const EXTRACT_PAIN_PROMPT_VERSION = 'extract-pain@1';

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
- Extract at most 3 pain points per document. Return {"painPoints": []} if the document contains none.
- evidenceText MUST be copied verbatim from the document. Never paraphrase or invent evidence.
- Only extract problems actually present in the text. Do not speculate.
- A pain point without at least one evidence quote must not be returned.`;

export function buildExtractPainUserMessage(
  document: StoredDocument,
  maxContentChars = 4000,
): string {
  return (
    `Document (source=${document.sourceId}, url=${document.url ?? 'n/a'}, ` +
    `published=${document.publishedAt ?? 'unknown'}):\n` +
    `Title: ${document.title}\n\n${document.content.slice(0, maxContentChars)}`
  );
}
