#!/usr/bin/env node
import { Command } from 'commander';
import { createApp } from '../container.js';
import type { StoredInsight } from '../core/types.js';

function printInsight(insight: StoredInsight): void {
  console.log(`\nInsight #${insight.id} (${insight.analyzerId}, ${insight.createdAt})`);
  console.log(`  Sentiment:   ${insight.sentiment}`);
  console.log(`  Opportunity: ${insight.opportunityScore}`);
  console.log(`  Keywords:    ${insight.keywords.join(', ') || '(none)'}`);
  console.log(`  Summary:     ${insight.summary}`);
}

const program = new Command();

program
  .name('atlas')
  .description('Atlas Market Research Engine — collect market data and analyze it with AI')
  .version('0.1.0');

program
  .command('sources')
  .description('List registered data sources')
  .action(() => {
    const app = createApp();
    try {
      for (const source of app.sources.list()) {
        console.log(`${source.id}\t${source.name}\t${source.description}`);
      }
    } finally {
      app.close();
    }
  });

program
  .command('collect')
  .description('Fetch items from data sources and store them in SQLite')
  .option('-s, --source <ids...>', 'source IDs to fetch from (default: all)')
  .option('-q, --query <query>', 'search topic / keyword')
  .option('-l, --limit <n>', 'max items per source', (v) => Number.parseInt(v, 10))
  .action(async (opts: { source?: string[]; query?: string; limit?: number }) => {
    const app = createApp();
    try {
      const result = await app.pipeline.collect({
        sourceIds: opts.source,
        query: opts.query,
        limit: opts.limit,
      });
      for (const [sourceId, count] of Object.entries(result.bySource)) {
        console.log(`${sourceId}: ${count} document(s) stored`);
      }
      console.log(`Total documents in DB: ${app.documents.count()}`);
    } finally {
      app.close();
    }
  });

program
  .command('analyze')
  .description('Run the AI analyzer over stored documents and save the insight')
  .option('-q, --query <query>', 'topic context passed to the analyzer')
  .action(async (opts: { query?: string }) => {
    const app = createApp();
    try {
      const insight = await app.pipeline.analyze({ query: opts.query });
      printInsight(insight);
    } finally {
      app.close();
    }
  });

program
  .command('run')
  .description('Full pipeline: collect from sources, then analyze')
  .option('-s, --source <ids...>', 'source IDs to fetch from (default: all)')
  .option('-q, --query <query>', 'search topic / keyword')
  .option('-l, --limit <n>', 'max items per source', (v) => Number.parseInt(v, 10))
  .action(async (opts: { source?: string[]; query?: string; limit?: number }) => {
    const app = createApp();
    try {
      const { collected, insight } = await app.pipeline.run({
        sourceIds: opts.source,
        query: opts.query,
        limit: opts.limit,
      });
      for (const [sourceId, count] of Object.entries(collected.bySource)) {
        console.log(`${sourceId}: ${count} document(s) stored`);
      }
      printInsight(insight);
    } finally {
      app.close();
    }
  });

program
  .command('report')
  .description('Show the latest stored insights')
  .option('-n, --limit <n>', 'number of insights to show', (v) => Number.parseInt(v, 10), 5)
  .action((opts: { limit: number }) => {
    const app = createApp();
    try {
      const insights = app.insights.findLatest(opts.limit);
      if (insights.length === 0) {
        console.log('No insights yet. Run `atlas run` first.');
        return;
      }
      for (const insight of insights) {
        printInsight(insight);
      }
    } finally {
      app.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
