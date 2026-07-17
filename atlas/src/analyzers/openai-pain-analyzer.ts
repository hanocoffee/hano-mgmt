import type { EvidenceRef, PainPointExtractor, PainPointEvaluator } from '../core/analyzer.js';
import type { ExtractedEvidence, ExtractedPainPoint, StoredDocument } from '../core/types.js';
import type { Logger } from '../logging/logger.js';
import { normalizeClusterKey } from '../core/scoring.js';
import {
  EXTRACT_PAIN_PROMPT_VERSION,
  EXTRACT_PAIN_SYSTEM_PROMPT,
  buildExtractPainUserMessage,
} from '../prompts/extract-pain.js';
import {
  EVALUATE_PAIN_PROMPT_VERSION,
  EVALUATE_PAIN_SYSTEM_PROMPT,
  buildEvaluatePainUserMessage,
} from '../prompts/evaluate-pain.js';
import type { ChatCompletionClient } from './openai-analyzer.js';
import { parseJsonContent } from './json-utils.js';

export interface OpenAIPainAnalyzerOptions {
  client: ChatCompletionClient;
  model: string;
  logger: Logger;
  maxContentChars?: number;
}

function normalizeEvidence(raw: unknown): ExtractedEvidence | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.evidenceText !== 'string' || !value.evidenceText.trim()) return undefined;
  return {
    evidenceText: value.evidenceText.trim(),
    evidenceType:
      typeof value.evidenceType === 'string' && value.evidenceType.trim()
        ? value.evidenceType.trim()
        : 'quote',
  };
}

function normalizeExtractedPain(raw: unknown): ExtractedPainPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const value = raw as Record<string, unknown>;
  const str = (key: string, fallback: string): string =>
    typeof value[key] === 'string' && (value[key] as string).trim()
      ? (value[key] as string).trim()
      : fallback;
  const problemStatement = str('problemStatement', '');
  if (!problemStatement) return undefined;
  const evidence = Array.isArray(value.evidence)
    ? value.evidence
        .map(normalizeEvidence)
        .filter((item): item is ExtractedEvidence => !!item)
        .slice(0, 5)
    : [];
  // The extraction prompt requires evidence; a pain point without any is dropped.
  if (evidence.length === 0) return undefined;
  return {
    problemStatement,
    targetUser: str('targetUser', 'unknown'),
    context: str('context', 'unknown'),
    currentWorkaround: str('currentWorkaround', '不明'),
    desiredOutcome: str('desiredOutcome', 'unknown'),
    clusterKey: normalizeClusterKey(str('clusterKey', problemStatement.slice(0, 40))),
    evidence,
  };
}

/** Stage A via the OpenAI Chat Completions API. */
export class OpenAIPainExtractor implements PainPointExtractor {
  readonly id = 'openai';
  readonly version = '1';
  readonly promptVersion = EXTRACT_PAIN_PROMPT_VERSION;

  constructor(private readonly options: OpenAIPainAnalyzerOptions) {}

  async extract(document: StoredDocument): Promise<ExtractedPainPoint[]> {
    const content = await this.options.client.complete({
      model: this.options.model,
      messages: [
        { role: 'system', content: EXTRACT_PAIN_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildExtractPainUserMessage(document, this.options.maxContentChars),
        },
      ],
      jsonMode: true,
    });
    const parsed = parseJsonContent(content);
    const list =
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as Record<string, unknown>).painPoints)
        ? ((parsed as Record<string, unknown>).painPoints as unknown[])
        : [];
    const pains = list
      .map(normalizeExtractedPain)
      .filter((pain): pain is ExtractedPainPoint => !!pain)
      .slice(0, 3);
    if (pains.length < list.length) {
      this.options.logger.warn('dropped malformed extracted pain points', {
        document: document.id,
        returned: list.length,
        kept: pains.length,
      });
    }
    return pains;
  }
}

/**
 * Stage B via the OpenAI Chat Completions API. Returns the parsed JSON as-is;
 * the pipeline validates it with normalizeEvaluation() before persisting.
 */
export class OpenAIPainEvaluator implements PainPointEvaluator {
  readonly id = 'openai';
  readonly version = '1';
  readonly promptVersion = EVALUATE_PAIN_PROMPT_VERSION;

  constructor(private readonly options: OpenAIPainAnalyzerOptions) {}

  async evaluate(painPoint: ExtractedPainPoint, evidence: EvidenceRef[]): Promise<unknown> {
    const content = await this.options.client.complete({
      model: this.options.model,
      messages: [
        { role: 'system', content: EVALUATE_PAIN_SYSTEM_PROMPT },
        { role: 'user', content: buildEvaluatePainUserMessage(painPoint, evidence) },
      ],
      jsonMode: true,
    });
    return parseJsonContent(content);
  }
}
