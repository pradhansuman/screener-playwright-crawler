// gap-detector.ts — Step 10: Detect coverage gaps

import { PageAnalysis, GeneratedTest, ExecutionReport, CoverageGap } from '../types';

/**
 * Analyzes test coverage against application features to find gaps.
 * Checks: uncovered pages, untested workflows, missing edge cases,
 * untested API endpoints, unvalidated form flows.
 */
export class GapDetector {
  /**
   * Detect coverage gaps from analyses, tests, and execution results
   */
  detect(
    analyses: PageAnalysis[],
    tests: GeneratedTest[],
    execution?: ExecutionReport,
  ): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    // 1. Uncovered pages
    gaps.push(...this.findUncoveredPages(analyses, tests));

    // 2. Untested workflows
    gaps.push(...this.findUntestedWorkflows(analyses, tests));

    // 3. Missing test categories per page
    gaps.push(...this.findMissingCategories(analyses, tests));

    // 4. Uncovered API endpoints
    gaps.push(...this.findUntestedApis(analyses));

    // 5. Failed-tests-turned-gaps
    if (execution) {
      gaps.push(...this.findGapsFromFailures(execution, tests));
    }

    // 6. Critical pages with low coverage
    gaps.push(...this.findLowCoveragePages(analyses, tests));

    // Sort by severity
    return gaps.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
    });
  }

  private findUncoveredPages(analyses: PageAnalysis[], tests: GeneratedTest[]): CoverageGap[] {
    const testedPages = new Set(tests.map(t => t.sourcePage));
    const uncovered = analyses.filter(a => !testedPages.has(a.pageUrl));

    if (uncovered.length === 0) return [];

    return [{
      id: 'gap-uncovered-pages',
      area: 'Page Coverage',
      description: `${uncovered.length} analyzed pages have zero tests`,
      severity: uncovered.length > 5 ? 'critical' : 'high',
      affectedPages: uncovered.map(p => p.pageUrl),
      missingCoverage: uncovered.map(p => `No tests for ${p.title || p.pageUrl}`),
      suggestedTestCount: uncovered.length * 3,
      riskIfUntested: 'Critical user flows on these pages may be broken without detection',
    }];
  }

  private findUntestedWorkflows(analyses: PageAnalysis[], tests: GeneratedTest[]): CoverageGap[] {
    const gaps: CoverageGap[] = [];
    const testIds = new Set(tests.map(t => t.id));

    const untestedWorkflows = analyses.flatMap(a =>
      a.workflows.filter(w => !testIds.has(`func-${w.id}`))
    );

    if (untestedWorkflows.length === 0) return [];

    const critical = untestedWorkflows.filter(w =>
      /login|checkout|payment|auth/i.test(w.name)
    );

    if (critical.length > 0) {
      gaps.push({
        id: 'gap-critical-workflows',
        area: 'Critical Workflows',
        description: `${critical.length} critical workflows are untested`,
        severity: 'critical',
        affectedPages: critical.map(w => w.startUrl),
        missingCoverage: critical.map(w => w.name),
        suggestedTestCount: critical.length * 2,
        riskIfUntested: 'Critical business flows may fail in production',
      });
    }

    return gaps;
  }

  private findMissingCategories(analyses: PageAnalysis[], tests: GeneratedTest[]): CoverageGap[] {
    const categories = ['functional', 'negative', 'boundary', 'accessibility', 'visual', 'security'] as const;
    const gaps: CoverageGap[] = [];

    for (const analysis of analyses) {
      const pageTests = tests.filter(t => t.sourcePage === analysis.pageUrl);
      const coveredCats = new Set(pageTests.map(t => t.category));
      const missing = categories.filter(c => !coveredCats.has(c));

      if (missing.length >= 3) {
        gaps.push({
          id: `gap-missing-categories-${this.slugify(analysis.pageUrl)}`,
          area: 'Test Category Coverage',
          description: `${analysis.title || analysis.pageUrl} missing ${missing.length} test categories`,
          severity: missing.includes('security') || missing.includes('accessibility') ? 'high' : 'medium',
          affectedPages: [analysis.pageUrl],
          missingCoverage: missing.map(c => `No ${c} tests`),
          suggestedTestCount: missing.length * 2,
          riskIfUntested: `Missing ${missing.join(', ')} coverage for this page`,
        });
      }
    }

    return gaps.slice(0, 5); // Limit to top 5
  }

  private findUntestedApis(analyses: PageAnalysis[]): CoverageGap[] {
    const allApis = analyses.flatMap(a => a.apis);
    const errorApis = allApis.filter(a => a.statusCode >= 400);

    if (errorApis.length === 0) return [];

    return [{
      id: 'gap-api-errors',
      area: 'API Coverage',
      description: `${errorApis.length} API calls returned errors during analysis`,
      severity: errorApis.length > 10 ? 'critical' : 'high',
      affectedPages: [...new Set(errorApis.map(a => a.pageUrl))],
      missingCoverage: errorApis.slice(0, 5).map(a =>
        `${a.method} ${a.url} → ${a.statusCode}`
      ),
      suggestedTestCount: errorApis.length,
      riskIfUntested: 'API failures indicate backend issues that need validation',
    }];
  }

  private findGapsFromFailures(execution: ExecutionReport, tests: GeneratedTest[]): CoverageGap[] {
    const failed = execution.results.filter(r => r.status === 'failed');

    if (failed.length === 0) return [];

    return [{
      id: 'gap-failed-tests',
      area: 'Test Reliability',
      description: `${failed.length} tests failed during execution`,
      severity: failed.length > execution.totalTests * 0.2 ? 'critical' : 'high',
      affectedPages: [...new Set(
        failed.map(f => tests.find(t => t.id === f.testId)?.sourcePage).filter(Boolean) as string[]
      )],
      missingCoverage: failed.map(f => f.testName),
      suggestedTestCount: failed.length,
      riskIfUntested: 'Failed tests indicate real application issues or flaky automation',
    }];
  }

  private findLowCoveragePages(analyses: PageAnalysis[], tests: GeneratedTest[]): CoverageGap[] {
    const gaps: CoverageGap[] = [];

    for (const analysis of analyses) {
      const pageTests = tests.filter(t => t.sourcePage === analysis.pageUrl);
      const threshold = 3;

      if (pageTests.length < threshold && analysis.interactiveElements.length > 10) {
        gaps.push({
          id: `gap-low-coverage-${this.slugify(analysis.pageUrl)}`,
          area: 'Coverage Depth',
          description: `${analysis.title || analysis.pageUrl}: only ${pageTests.length} tests for ${analysis.interactiveElements.length} interactive elements`,
          severity: 'medium',
          affectedPages: [analysis.pageUrl],
          missingCoverage: [
            `Only ${pageTests.length} tests — needs at least ${threshold}`,
          ],
          suggestedTestCount: threshold - pageTests.length,
          riskIfUntested: 'Under-tested page with many interactive elements',
        });
      }
    }

    return gaps.slice(0, 5);
  }

  /**
   * Estimate how many new tests are needed to fill all gaps
   */
  estimateNewTests(gaps: CoverageGap[]): number {
    return gaps.reduce((sum, g) => sum + g.suggestedTestCount, 0);
  }

  /**
   * Get the most critical area that needs attention
   */
  getTopPriority(gaps: CoverageGap[]): CoverageGap | null {
    return gaps.length > 0 ? gaps[0] : null;
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 40).toLowerCase();
  }
}
