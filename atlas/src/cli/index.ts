#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { createApp } from '../container.js';
import { parseSourceItems } from '../sources/file-import.js';
import {
  buildOpportunityReport,
  renderReportJson,
  renderReportMarkdown,
} from '../reports/opportunity-report.js';
import type { StoredInsight, StoredPainPoint } from '../core/types.js';

function printPainPoint(pain: StoredPainPoint): void {
  console.log(
    `#${pain.id} score=${pain.opportunityScore} conf=${pain.confidence} [${pain.clusterKey}]`,
  );
  console.log(`  ${pain.problemStatement}`);
  console.log(`  target: ${pain.targetUser} | doc: ${pain.documentId}`);
  console.log(
    `  sev=${pain.severity} freq=${pain.frequency} wtp=${pain.willingnessToPay} ` +
      `auto=${pain.automationFit} reach=${pain.reachability} evid=${pain.evidenceQuality}`,
  );
}

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
  .command('insights')
  .description('Show the latest stored insights (summary analysis)')
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

program
  .command('import')
  .description('Import manually collected items (JSON array or JSONL) as documents')
  .argument('<file>', 'path to a .json / .jsonl file')
  .option('--source-id <id>', 'sourceId for records that do not specify one', 'manual')
  .action((file: string, opts: { sourceId: string }) => {
    const app = createApp();
    try {
      const raw = readFileSync(file, 'utf8');
      const { items, errors } = parseSourceItems(raw, { defaultSourceId: opts.sourceId });
      const stored = app.documents.upsertMany(items);
      console.log(`Imported ${stored.length} document(s) from ${file}`);
      if (errors.length > 0) {
        console.log(`Skipped ${errors.length} record(s):`);
        for (const error of errors) {
          console.log(`  - ${error}`);
        }
      }
      console.log(`Total documents in DB: ${app.documents.count()}`);
    } finally {
      app.close();
    }
  });

program
  .command('analyze-pains')
  .description('Extract and evaluate pain points from stored documents (two-stage analysis)')
  .option('--all', 're-analyze all documents, not only unprocessed ones')
  .option('-l, --limit <n>', 'max documents to process', (v) => Number.parseInt(v, 10))
  .action(async (opts: { all?: boolean; limit?: number }) => {
    const app = createApp();
    try {
      const summary = await app.painPipeline.analyze({ all: opts.all, limit: opts.limit });
      console.log(
        `Processed ${summary.documentsProcessed} document(s): ` +
          `${summary.painPointsSaved} pain point(s), ${summary.ideasSaved} idea(s) saved` +
          (summary.evaluationsRejected > 0
            ? `, ${summary.evaluationsRejected} evaluation(s) rejected`
            : '') +
          (summary.documentsFailed > 0 ? `, ${summary.documentsFailed} document(s) failed` : ''),
      );
    } finally {
      app.close();
    }
  });

program
  .command('pains')
  .description('List pain points ordered by opportunity score')
  .option('-n, --limit <n>', 'number of pain points to show', (v) => Number.parseInt(v, 10), 20)
  .action((opts: { limit: number }) => {
    const app = createApp();
    try {
      const pains = app.painPoints.listPains(opts.limit);
      if (pains.length === 0) {
        console.log('No pain points yet. Run `atlas import <file>` then `atlas analyze-pains`.');
        return;
      }
      for (const pain of pains) {
        printPainPoint(pain);
      }
    } finally {
      app.close();
    }
  });

program
  .command('ideas')
  .description('List business ideas ordered by their pain point opportunity score')
  .option('-n, --limit <n>', 'number of ideas to show', (v) => Number.parseInt(v, 10), 20)
  .action((opts: { limit: number }) => {
    const app = createApp();
    try {
      const ideas = app.painPoints.listIdeas(opts.limit);
      if (ideas.length === 0) {
        console.log('No business ideas yet. Run `atlas analyze-pains` first.');
        return;
      }
      for (const idea of ideas) {
        console.log(`#${idea.id} score=${idea.opportunityScore} [${idea.status}] ${idea.name}`);
        console.log(`  ${idea.valueProposition}`);
        console.log(`  pain: ${idea.problemStatement}`);
        console.log(
          `  ${idea.productType} / ${idea.suggestedPriceModel} / build: ${idea.estimatedBuildComplexity}`,
        );
      }
    } finally {
      app.close();
    }
  });

program
  .command('report')
  .description('Output the top pain points and business ideas')
  .option('-f, --format <format>', 'markdown | json', 'markdown')
  .option('-t, --top <n>', 'number of top pain points', (v) => Number.parseInt(v, 10), 5)
  .action((opts: { format: string; top: number }) => {
    const app = createApp();
    try {
      if (opts.format !== 'markdown' && opts.format !== 'json') {
        console.error(`Unknown format: ${opts.format} (use markdown or json)`);
        process.exitCode = 1;
        return;
      }
      const report = buildOpportunityReport(
        { documents: app.documents, painPoints: app.painPoints },
        opts.top,
      );
      console.log(opts.format === 'json' ? renderReportJson(report) : renderReportMarkdown(report));
    } finally {
      app.close();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
