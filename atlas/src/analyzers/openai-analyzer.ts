import type { AnalyzeContext, MarketAnalyzer } from '../core/analyzer.js';
import type { AnalysisResult, Sentiment, StoredDocument } from '../core/types.js';
import type { Logger } from '../logging/logger.js';

/**
 * Minimal chat-completion abstraction so the analyzer can be tested
 * without network access and swapped to another provider-compatible
 * endpoint (Azure OpenAI, local proxy, ...).
 */
export interface ChatCompletionClient {
  /** Send messages and return the assistant's text content. */
  complete(request: {
    model: string;
    messages: { role: 'system' | 'user'; content: string }[];
    temperature?: number;
    jsonMode?: boolean;
  }): Promise<string>;
}

export interface OpenAIChatClientOptions {
  apiKey: string;
  /** Defaults to the official OpenAI endpoint. */
  baseUrl?: string;
}

/** fetch-based client for the OpenAI Chat Completions API. */
export class OpenAIChatClient implements ChatCompletionClient {
  private readonly baseUrl: string;

  constructor(private readonly options: OpenAIChatClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async complete(request: {
    model: string;
    messages: { role: 'system' | 'user'; content: string }[];
    temperature?: number;
    jsonMode?: boolean;
  }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body.slice(0, 500)}`);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI API returned no message content');
    }
    return content;
  }
}

export interface OpenAIAnalyzerOptions {
  client: ChatCompletionClient;
  model: string;
  logger: Logger;
  /** Max documents per analysis call, to bound token usage. */
  maxDocuments?: number;
  /** Max characters of content taken from each document. */
  maxContentChars?: number;
}

interface RawAnalysis {
  summary?: unknown;
  sentiment?: unknown;
  keywords?: unknown;
  opportunityScore?: unknown;
}

const SENTIMENTS: Sentiment[] = ['positive', 'neutral', 'negative'];

const SYSTEM_PROMPT = `You are a market research analyst helping a small business owner find profitable AI-powered business opportunities.
Analyze the provided market documents and respond with ONLY a JSON object of this shape:
{
  "summary": "3-5 sentence summary of the market signals, in Japanese",
  "sentiment": "positive" | "neutral" | "negative",
  "keywords": ["up to 10 key topics, lowercase"],
  "opportunityScore": 0.0-1.0 (how promising the business opportunity looks; pain points count as opportunities)
}`;

/**
 * ChatGPT-backed analyzer. Requires OPENAI_API_KEY; select it with
 * ATLAS_ANALYZER=openai.
 */
export class OpenAIAnalyzer implements MarketAnalyzer {
  readonly id = 'openai';
  readonly name = 'OpenAI (ChatGPT) Analyzer';

  private readonly maxDocuments: number;
  private readonly maxContentChars: number;

  constructor(private readonly options: OpenAIAnalyzerOptions) {
    this.maxDocuments = options.maxDocuments ?? 50;
    this.maxContentChars = options.maxContentChars ?? 2000;
  }

  async analyze(documents: StoredDocument[], context?: AnalyzeContext): Promise<AnalysisResult> {
    if (documents.length === 0) {
      return {
        analyzerId: this.id,
        summary: 'No documents to analyze.',
        sentiment: 'neutral',
        keywords: [],
        opportunityScore: 0,
        documentIds: [],
      };
    }

    const selected = documents.slice(0, this.maxDocuments);
    if (selected.length < documents.length) {
      this.options.logger.warn('document set truncated for analysis', {
        total: documents.length,
        analyzed: selected.length,
      });
    }

    const docsBlock = selected
      .map(
        (d, i) =>
          `[${i + 1}] source=${d.sourceId} published=${d.publishedAt ?? 'unknown'}\n` +
          `Title: ${d.title}\n${d.content.slice(0, this.maxContentChars)}`,
      )
      .join('\n\n---\n\n');
    const topic = context?.query ? `Research topic: ${context.query}\n\n` : '';

    const content = await this.options.client.complete({
      model: this.options.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${topic}Documents:\n\n${docsBlock}` },
      ],
      jsonMode: true,
    });

    const parsed = this.parseResponse(content);
    return { ...parsed, analyzerId: this.id, documentIds: selected.map((d) => d.id) };
  }

  private parseResponse(content: string): Omit<AnalysisResult, 'analyzerId' | 'documentIds'> {
    // Tolerate models that wrap JSON in a markdown code fence.
    const stripped = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    let raw: RawAnalysis;
    try {
      raw = JSON.parse(stripped) as RawAnalysis;
    } catch {
      throw new Error(`Analyzer response was not valid JSON: ${content.slice(0, 200)}`);
    }

    const sentiment: Sentiment = SENTIMENTS.includes(raw.sentiment as Sentiment)
      ? (raw.sentiment as Sentiment)
      : 'neutral';
    const keywords = Array.isArray(raw.keywords)
      ? raw.keywords.filter((k): k is string => typeof k === 'string').slice(0, 10)
      : [];
    const scoreNumber = typeof raw.opportunityScore === 'number' ? raw.opportunityScore : 0;
    const opportunityScore = Math.min(1, Math.max(0, scoreNumber));

    return {
      summary: typeof raw.summary === 'string' && raw.summary ? raw.summary : '(no summary returned)',
      sentiment,
      keywords,
      opportunityScore: Number(opportunityScore.toFixed(2)),
    };
  }
}
