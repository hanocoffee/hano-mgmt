import type { StoredBusinessIdea, StoredEvidence, StoredPainPoint } from '../core/types.js';
import type { DocumentRepository } from '../storage/repositories.js';
import type { PainPointRepository } from '../storage/pain-repository.js';

export interface PainPointReportEntry {
  painPoint: StoredPainPoint;
  evidence: StoredEvidence[];
  ideas: StoredBusinessIdea[];
}

export interface OpportunityReport {
  generatedAt: string;
  totals: {
    documents: number;
    painPoints: number;
    businessIdeas: number;
  };
  topPainPoints: PainPointReportEntry[];
}

export function buildOpportunityReport(
  deps: { documents: DocumentRepository; painPoints: PainPointRepository },
  top = 5,
): OpportunityReport {
  const pains = deps.painPoints.listPains(top);
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      documents: deps.documents.count(),
      painPoints: deps.painPoints.countPains(),
      businessIdeas: deps.painPoints.countIdeas(),
    },
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
    `Documents: ${report.totals.documents} / Pain points: ${report.totals.painPoints} / Business ideas: ${report.totals.businessIdeas}`,
    '',
  ];

  if (report.topPainPoints.length === 0) {
    lines.push('_No pain points yet. Run `atlas import` and `atlas analyze-pains` first._');
    return lines.join('\n');
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
