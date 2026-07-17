import { describe, expect, it } from 'vitest';
import { OpenAIAnalyzer, type ChatCompletionClient } from '../src/analyzers/openai-analyzer.js';
import type { StoredDocument } from '../src/core/types.js';
import { NullLogger } from '../src/logging/logger.js';

function doc(id: number): StoredDocument {
  return {
    id,
    sourceId: 'test',
    externalId: `ext-${id}`,
    title: `Title ${id}`,
    content: `Content ${id}`,
    collectedAt: '2026-01-01T00:00:00Z',
  };
}

class FakeClient implements ChatCompletionClient {
  lastRequest?: Parameters<ChatCompletionClient['complete']>[0];

  constructor(private readonly response: string) {}

  async complete(request: Parameters<ChatCompletionClient['complete']>[0]): Promise<string> {
    this.lastRequest = request;
    return this.response;
  }
}

function analyzer(client: ChatCompletionClient, maxDocuments?: number): OpenAIAnalyzer {
  return new OpenAIAnalyzer({ client, model: 'gpt-test', logger: new NullLogger(), maxDocuments });
}

describe('OpenAIAnalyzer', () => {
  it('parses a valid JSON response into an AnalysisResult', async () => {
    const client = new FakeClient(
      JSON.stringify({
        summary: '市場は成長傾向。',
        sentiment: 'positive',
        keywords: ['ai', 'coffee'],
        opportunityScore: 0.85,
      }),
    );

    const result = await analyzer(client).analyze([doc(1), doc(2)], { query: 'coffee' });

    expect(result.analyzerId).toBe('openai');
    expect(result.summary).toBe('市場は成長傾向。');
    expect(result.sentiment).toBe('positive');
    expect(result.keywords).toEqual(['ai', 'coffee']);
    expect(result.opportunityScore).toBe(0.85);
    expect(result.documentIds).toEqual([1, 2]);
    expect(client.lastRequest?.model).toBe('gpt-test');
    expect(client.lastRequest?.messages[1]?.content).toContain('Research topic: coffee');
    expect(client.lastRequest?.messages[1]?.content).toContain('Title 1');
  });

  it('tolerates markdown code fences around the JSON', async () => {
    const client = new FakeClient(
      '```json\n{"summary":"ok","sentiment":"negative","keywords":[],"opportunityScore":0.3}\n```',
    );
    const result = await analyzer(client).analyze([doc(1)]);
    expect(result.sentiment).toBe('negative');
    expect(result.opportunityScore).toBe(0.3);
  });

  it('normalizes invalid fields instead of failing', async () => {
    const client = new FakeClient(
      JSON.stringify({ summary: 42, sentiment: 'ecstatic', keywords: 'nope', opportunityScore: 7 }),
    );
    const result = await analyzer(client).analyze([doc(1)]);
    expect(result.summary).toBe('(no summary returned)');
    expect(result.sentiment).toBe('neutral');
    expect(result.keywords).toEqual([]);
    expect(result.opportunityScore).toBe(1);
  });

  it('throws a clear error for a non-JSON response', async () => {
    const client = new FakeClient('Sorry, I cannot do that.');
    await expect(analyzer(client).analyze([doc(1)])).rejects.toThrow(/not valid JSON/);
  });

  it('returns a neutral result without calling the API for no documents', async () => {
    const client = new FakeClient('should not be used');
    const result = await analyzer(client).analyze([]);
    expect(result.sentiment).toBe('neutral');
    expect(client.lastRequest).toBeUndefined();
  });

  it('truncates the document set to maxDocuments', async () => {
    const client = new FakeClient(
      JSON.stringify({ summary: 's', sentiment: 'neutral', keywords: [], opportunityScore: 0.5 }),
    );
    const result = await analyzer(client, 2).analyze([doc(1), doc(2), doc(3)]);
    expect(result.documentIds).toEqual([1, 2]);
  });
});
