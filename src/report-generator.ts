// report-generator.ts — Generate crawl, coverage, and QA reports

import { PageAnalysis, GeneratedTest, CoverageReport, CrawlReport } from './types';
import * as path from 'path';

export class ReportGenerator {
  /**
   * Generate a coverage report from analyses and tests
   */
  generateCoverageReport(
    analyses: PageAnalysis[],
    tests: GeneratedTest[],
  ): CoverageReport {
    const allForms = analyses.flatMap(a => a.forms);
    const allLinks = analyses.flatMap(a => a.interactiveElements.filter(e => e.elementType === 'link'));
    const allWorkflows = analyses.flatMap(a => a.workflows);
    const allApis = analyses.flatMap(a => a.apis);
    const allInteractives = analyses.flatMap(a => a.interactiveElements);

    const testedSelectors = new Set(
      tests.flatMap(t => t.steps.filter(s => s.target).map(s => s.target!))
    );

    const formsTested = allForms.filter(f => testedSelectors.has(f.selector)).length;
    const linksTested = allLinks.filter(l => testedSelectors.has(l.selector)).length;
    const workflowsTested = allWorkflows.filter(w => testedSelectors.has(w.startUrl)).length;

    return {
      generatedAt: new Date(),
      pagesAnalyzed: analyses.length,
      coverageByType: {
        forms: {
          total: allForms.length,
          tested: formsTested,
          percentage: allForms.length > 0 ? Math.round((formsTested / allForms.length) * 100) : 0,
        },
        links: {
          total: allLinks.length,
          tested: linksTested,
          percentage: allLinks.length > 0 ? Math.round((linksTested / allLinks.length) * 100) : 0,
        },
        workflows: {
          total: allWorkflows.length,
          tested: workflowsTested,
          percentage: allWorkflows.length > 0 ? Math.round((workflowsTested / allWorkflows.length) * 100) : 0,
        },
        apis: {
          total: allApis.length,
          monitored: allApis.filter(a => a.statusCode >= 200 && a.statusCode < 400).length,
          percentage: allApis.length > 0
            ? Math.round((allApis.filter(a => a.statusCode >= 200 && a.statusCode < 400).length / allApis.length) * 100)
            : 0,
        },
        interactiveElements: {
          total: allInteractives.length,
          tested: allInteractives.filter(e => testedSelectors.has(e.selector)).length,
          percentage: allInteractives.length > 0
            ? Math.round((allInteractives.filter(e => testedSelectors.has(e.selector)).length / allInteractives.length) * 100)
            : 0,
        },
      },
      untestedPaths: this.findUntestedPaths(analyses, tests),
      recommendations: this.generateRecommendations(analyses, tests),
    };
  }

  /**
   * Generate a QA report as HTML
   */
  generateQaReport(analyses: PageAnalysis[], tests: GeneratedTest[]): string {
    const coverage = this.generateCoverageReport(analyses, tests);
    const byCategory = this.groupByCategory(tests);
    const byPriority = this.groupByPriority(tests);

    const totalIssues = analyses.flatMap(a => a.accessibilityIssues).length;
    const totalSecurityConcerns = analyses.flatMap(a => a.securityConcerns).length;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QA Report — Screener Playwright Crawler</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #38bdf8; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1e293b; border-radius: 12px; padding: 1.5rem; border: 1px solid #334155; }
    .card .value { font-size: 2.5rem; font-weight: 700; color: #38bdf8; }
    .card .label { color: #94a3b8; margin-top: 0.25rem; font-size: 0.875rem; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; background: #1e293b; border-radius: 12px; overflow: hidden; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #334155; }
    th { background: #0f172a; color: #38bdf8; font-weight: 600; }
    .bar { height: 8px; background: #334155; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; }
    .bar-high { background: #22c55e; }
    .bar-medium { background: #eab308; }
    .bar-low { background: #ef4444; }
    .tag { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; }
    .tag-critical { background: #7f1d1d; color: #fca5a5; }
    .tag-high { background: #78350f; color: #fcd34d; }
    .tag-medium { background: #1e3a5f; color: #93c5fd; }
    .tag-low { background: #1e293b; color: #94a3b8; }
    .section { margin-bottom: 2rem; }
    .section h2 { color: #38bdf8; margin-bottom: 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>🦞 QA Report</h1>
  <p class="subtitle">Generated by Screener Playwright Crawler v2.0 — ${new Date().toISOString()}</p>

  <div class="grid">
    <div class="card">
      <div class="value">${tests.length}</div>
      <div class="label">Total Tests Generated</div>
    </div>
    <div class="card">
      <div class="value">${analyses.length}</div>
      <div class="label">Pages Analyzed</div>
    </div>
    <div class="card">
      <div class="value">${totalIssues}</div>
      <div class="label">Accessibility Issues</div>
    </div>
    <div class="card">
      <div class="value">${totalSecurityConcerns}</div>
      <div class="label">Security Concerns</div>
    </div>
  </div>

  <div class="section">
    <h2>Coverage by Type</h2>
    <table>
      <tr><th>Type</th><th>Total</th><th>Tested</th><th>Coverage</th></tr>
      ${Object.entries(coverage.coverageByType).map(([type, data]) => `
      <tr>
        <td>${type}</td>
        <td>${data.total}</td>
        <td>${data.tested}</td>
        <td>
          <div class="bar"><div class="bar-fill ${data.percentage >= 70 ? 'bar-high' : data.percentage >= 40 ? 'bar-medium' : 'bar-low'}" style="width:${data.percentage}%"></div></div>
          ${data.percentage}%
        </td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>Tests by Category</h2>
    <table>
      <tr><th>Category</th><th>Count</th><th>Percentage</th></tr>
      ${Object.entries(byCategory).sort(([,a], [,b]) => b - a).map(([cat, count]) => `
      <tr>
        <td>${cat}</td>
        <td>${count}</td>
        <td>${((count / tests.length) * 100).toFixed(1)}%</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>Tests by Priority</h2>
    <table>
      <tr><th>Priority</th><th>Count</th></tr>
      ${Object.entries(byPriority).sort(([a], [b]) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a] ?? 4) - (order[b] ?? 4);
      }).map(([pri, count]) => `
      <tr>
        <td><span class="tag tag-${pri}">${pri.toUpperCase()}</span></td>
        <td>${count}</td>
      </tr>`).join('')}
    </table>
  </div>

  <div class="section">
    <h2>Recommendations</h2>
    <ul style="padding-left:1.5rem; line-height:2;">
      ${coverage.recommendations.map(r => `<li>${r}</li>`).join('')}
    </ul>
  </div>

  <p style="color:#64748b;font-size:0.75rem;margin-top:2rem;border-top:1px solid #334155;padding-top:1rem;">
    Generated by Screener Playwright Crawler • ${new Date().toLocaleString()}
  </p>
</body>
</html>`;
  }

  private groupByCategory(tests: GeneratedTest[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const t of tests) {
      groups[t.category] = (groups[t.category] || 0) + 1;
    }
    return groups;
  }

  private groupByPriority(tests: GeneratedTest[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const t of tests) {
      groups[t.priority] = (groups[t.priority] || 0) + 1;
    }
    return groups;
  }

  private findUntestedPaths(analyses: PageAnalysis[], tests: GeneratedTest[]): string[] {
    const testedPages = new Set(tests.map(t => t.sourcePage));
    return analyses
      .filter(a => !testedPages.has(a.pageUrl))
      .map(a => a.pageUrl);
  }

  private generateRecommendations(analyses: PageAnalysis[], tests: GeneratedTest[]): string[] {
    const recs: string[] = [];

    if (analyses.length === 0) {
      recs.push('No pages analyzed — run on a reachable target URL');
      return recs;
    }

    if (tests.length < 10) {
      recs.push(`Only ${tests.length} tests generated — expand by crawling more pages.`);
    }

    const a11yIssues = analyses.flatMap(a => a.accessibilityIssues);
    const criticalA11y = a11yIssues.filter(i => i.impact === 'critical');
    if (criticalA11y.length > 0) {
      recs.push(`Fix ${criticalA11y.length} critical accessibility issues before release.`);
    }

    const secConcerns = analyses.flatMap(a => a.securityConcerns);
    const criticalSec = secConcerns.filter(s => s.severity === 'critical');
    if (criticalSec.length > 0) {
      recs.push(`Address ${criticalSec.length} critical security concerns immediately.`);
    }

    if (analyses.flatMap(a => a.forms).some(f => !f.submitButton)) {
      recs.push('Some forms lack a submit button. Ensure all forms have clear submission controls.');
    }

    if (recs.length === 0) {
      recs.push('Good test coverage. Consider adding visual regression and performance tests.');
    }

    return recs;
  }
}
