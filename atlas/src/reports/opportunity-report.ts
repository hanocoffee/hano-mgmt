import type { StoredBusinessIdea, StoredEvidence, StoredPainPoint } from '../core/types.js';
import { buildClusters, selectOpportunities, type PainCluster } from '../core/clustering.js';
import type { DocumentRepository } from '../storage/repositories.js';
import type { PainPointRepository } from '../storage/pain-repository.js';

export interface PainPointReportEntry {
  painPoint: StoredPainPoint;
  evidence: StoredEvidence[];
  ideas: StoredBusinessIdea[];
}

export interface ClusterReportEntry {
  key: string;
  mergedKeys: string[];
  size: number;
  documentCount: number;
  avgOpportunity: number;
  maxOpportunity: number;
  score: number;
  /** Highest-scoring pain statements in this cluster. */
  topProblems: { painPointId: number; problemStatement: string; opportunityScore: number }[];
}

export interface OpportunityReport {
  generatedAt: string;
  totals: {
    documents: number;
    painPoints: number;
    businessIdeas: number;
    clusters: number;
  };
  /** Top clusters = the market opportunities. */
  opportunities: ClusterReportEntry[];
  topPainPoints: PainPointReportEntry[];
}

function toClusterEntry(cluster: PainCluster): ClusterReportEntry {
  return {
    key: cluster.key,
    mergedKeys: cluster.mergedKeys,
    size: cluster.size,
    documentCount: cluster.documentCount,
    avgOpportunity: cluster.avgOpportunity,
    maxOpportunity: cluster.maxOpportunity,
    score: cluster.score,
    topProblems: cluster.painPoints.slice(0, 3).map((pain) => ({
      painPointId: pain.id,
      problemStatement: pain.problemStatement,
      opportunityScore: pain.opportunityScore,
    })),
  };
}

export function buildOpportunityReport(
  deps: { documents: DocumentRepository; painPoints: PainPointRepository },
  top = 5,
  topOpportunities = 5,
): OpportunityReport {
  const pains = deps.painPoints.listPains(top);
  const clusters = buildClusters(deps.painPoints.listPains(10000));
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      documents: deps.documents.count(),
      painPoints: deps.painPoints.countPains(),
      businessIdeas: deps.painPoints.countIdeas(),
      clusters: clusters.length,
    },
    opportunities: selectOpportunities(clusters, topOpportunities).map(toClusterEntry),
    topPainPoints: pains.map((painPoint) => ({
      painPoint,
      evidence: deps.painPoints.getEvidence(painPoint.id),
      ideas: deps.painPoints.getIdeas(painPoint.id),
    })),
  };
}

export function renderReportJson(report: OpportunityReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderReportMarkdown(report: OpportunityReport): string {
  const lines: string[] = [
    '# Atlas Opportunity Report',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Documents: ${report.totals.documents} / Pain points: ${report.totals.painPoints} / Clusters: ${report.totals.clusters} / Business ideas: ${report.totals.businessIdeas}`,
    '',
  ];

  if (report.topPainPoints.length === 0) {
    lines.push('_No pain points yet. Run `atlas import` and `atlas analyze-pains` first._');
    return lines.join('\n');
  }

  if (report.opportunities.length > 0) {
    lines.push('## Opportunities (top clusters)', '');
    report.opportunities.forEach((cluster, index) => {
      lines.push(
        `### O${index + 1}. \`${cluster.key}\` — score ${cluster.score}`,
        '',
        `- ${cluster.size} pain point(s) across ${cluster.documentCount} document(s) / avg opportunity ${cluster.avgOpportunity} / max ${cluster.maxOpportunity}`,
      );
      if (cluster.mergedKeys.length > 1) {
        lines.push(`- Merged keys: ${cluster.mergedKeys.map((k) => `\`${k}\``).join(', ')}`);
      }
      for (const problem of cluster.topProblems) {
        lines.push(`- (#${problem.painPointId}, ${problem.opportunityScore}) ${problem.problemStatement}`);
      }
      lines.push('');
    });
    lines.push('---', '');
  }

  report.topPainPoints.forEach((entry, index) => {
    const p = entry.painPoint;
    lines.push(
      `## ${index + 1}. ${p.problemStatement}`,
      '',
      `- Opportunity score: **${p.opportunityScore}** (confidence: ${p.confidence})`,
      `- Cluster: \`${p.clusterKey}\` / Target: ${p.targetUser}`,
      `- Context: ${p.context}`,
      `- Current workaround: ${p.currentWorkaround}`,
      `- Desired outcome: ${p.desiredOutcome}`,
      `- Scores: severity ${p.severity} / frequency ${p.frequency} / willingness-to-pay ${p.willingnessToPay} / automation-fit ${p.automationFit} / reachability ${p.reachability} / evidence ${p.evidenceQuality}`,
      `- Versions: ${p.analyzerVersion} (${p.promptVersion})`,
      '',
      '### Reasoning',
      '',
      p.reasoningSummary,
      '',
    );

    if (entry.evidence.length > 0) {
      lines.push('### Evidence', '');
      for (const item of entry.evidence) {
        const source = item.sourceUrl ? ` — ${item.sourceUrl}` : '';
        lines.push(`- [${item.evidenceType}] "${item.evidenceText}"${source}`);
      }
      lines.push('');
    }

    if (entry.ideas.length > 0) {
      lines.push('### Business ideas', '');
      for (const idea of entry.ideas) {
        lines.push(
          `- **${idea.name}** (${idea.status}) — ${idea.valueProposition}`,
          `  - ${idea.productType} / ${idea.suggestedPriceModel} / build: ${idea.estimatedBuildComplexity}`,
          `  - Customer: ${idea.targetCustomer} / Channel: ${idea.acquisitionChannel} / Delivery: ${idea.deliveryMethod}`,
          `  - Human work: ${idea.humanWorkRequired}`,
          `  - Validation: ${idea.validationMethod}`,
        );
      }
      lines.push('');
    }
  });

  return lines.join('\n');
}
