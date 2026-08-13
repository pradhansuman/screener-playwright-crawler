// regression-runner.ts — Steps 11-12: Create missing tests + Run regression

import {
  GeneratedTest, ExecutionReport, CoverageGap, RegressionReport, PageAnalysis,
} from '../types';
import { TestExecutor } from './executor/test-executor';
import { FunctionalGenerator } from './generator/functional-generator';
import { NegativeGenerator } from './generator/negative-generator';
import { BoundaryGenerator } from './generator/boundary-generator';
import { AccessibilityGenerator } from './generator/accessibility-generator';
import { VisualGenerator } from './generator/visual-generator';
import { SecurityGenerator } from './generator/security-generator';
import { TestWriter } from './test-writer';

/**
 * Creates missing tests for coverage gaps, then runs full regression.
 */
export class RegressionRunner {
  private executor = new TestExecutor();
  private functionalGen = new FunctionalGenerator();
  private negativeGen = new NegativeGenerator();
  private boundaryGen = new BoundaryGenerator();
  private accessibilityGen = new AccessibilityGenerator();
  private visualGen = new VisualGenerator();
  private securityGen = new SecurityGenerator();

  private previousReport: RegressionReport | null = null;

  /**
   * Step 11: Create missing tests to fill coverage gaps
   */
  createMissingTests(
    analyses: PageAnalysis[],
    gaps: CoverageGap[],
    outputDir: string,
  ): GeneratedTest[] {
    const newTests: GeneratedTest[] = [];

    // For each gap, generate targeted tests
    for (const gap of gaps) {
      const affectedAnalyses = analyses.filter(a =>
        gap.affectedPages.includes(a.pageUrl)
      );

      for (const analysis of affectedAnalyses) {
        // Generate only the missing categories
        const missingCats = gap.missingCoverage
          .map(m => {
            if (m.includes('functional') || m.includes('No tests')) return 'functional';
            if (m.includes('negative')) return 'negative';
            if (m.includes('boundary')) return 'boundary';
            if (m.includes('accessibility')) return 'accessibility';
            if (m.includes('visual')) return 'visual';
            if (m.includes('security')) return 'security';
            return null;
          })
          .filter(Boolean) as string[];

        for (const cat of [...new Set(missingCats)]) {
          let catTests: GeneratedTest[] = [];
          switch (cat) {
            case 'functional': catTests = this.functionalGen.generate(analysis); break;
            case 'negative': catTests = this.negativeGen.generate(analysis); break;
            case 'boundary': catTests = this.boundaryGen.generate(analysis); break;
            case 'accessibility': catTests = this.accessibilityGen.generate(analysis); break;
            case 'visual': catTests = this.visualGen.generate(analysis); break;
            case 'security': catTests = this.securityGen.generate(analysis); break;
          }
          // Take only what's needed
          newTests.push(...catTests.slice(0, gap.suggestedTestCount));
        }
      }
    }

    // Write the new tests
    if (newTests.length > 0) {
      const writer = new TestWriter(outputDir);
      writer.writeAll(newTests);
    }

    return newTests;
  }

  /**
   * Step 12: Run full regression test suite
   */
  async runRegression(
    allTests: GeneratedTest[],
    previousReport?: RegressionReport,
  ): Promise<RegressionReport> {
    this.previousReport = previousReport || null;

    const execution = await this.executor.execute(allTests);

    // Compare with baseline
    const newFailures: string[] = [];
    const fixedFailures: string[] = [];

    if (this.previousReport) {
      const prevFailedIds = new Set(this.previousReport.newFailures);
      const currentFailedIds = new Set(
        execution.results
          .filter(r => r.status === 'failed')
          .map(r => r.testId)
      );

      // New failures: failed now but not before
      for (const id of currentFailedIds) {
        if (!prevFailedIds.has(id)) {
          newFailures.push(id);
        }
      }

      // Fixed failures: failed before but pass now
      for (const id of prevFailedIds) {
        if (!currentFailedIds.has(id)) {
          fixedFailures.push(id);
        }
      }
    } else {
      // First run — all failures are new
      newFailures.push(
        ...execution.results
          .filter(r => r.status === 'failed')
          .map(r => r.testId)
      );
    }

    // Calculate stability score
    const stabilityScore = this.calculateStability(execution, newFailures.length);

    const report: RegressionReport = {
      runId: `regression-${Date.now()}`,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      totalTests: execution.totalTests,
      passed: execution.passed,
      failed: execution.failed,
      newFailures,
      fixedFailures,
      durationMs: execution.durationMs,
      comparedToBaseline: this.previousReport?.runId || 'first-run',
      stabilityScore,
    };

    // Store for next comparison
    this.previousReport = report;
    return report;
  }

  /**
   * Calculate stability score (0-100)
   */
  private calculateStability(execution: ExecutionReport, newFailureCount: number): number {
    if (execution.totalTests === 0) return 100;

    let score = 100;

    // Deduct for failures
    const failRate = execution.failed / execution.totalTests;
    score -= Math.round(failRate * 60);

    // Deduct for flaky tests
    const flakyRate = execution.flaky / execution.totalTests;
    score -= Math.round(flakyRate * 40);

    // Deduct for new failures (regressions)
    if (execution.totalTests > 0) {
      score -= Math.round((newFailureCount / execution.totalTests) * 30);
    }

    // Bonus for fixed failures
    if (this.previousReport) {
      const fixedBonus = Math.min(10, Math.round(
        ((execution.totalTests - execution.failed - execution.flaky) / execution.totalTests) * 10
      ));
      score += fixedBonus;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get trend analysis
   */
  getTrend(): 'improving' | 'stable' | 'declining' | 'unknown' {
    if (!this.previousReport) return 'unknown';

    const prevScore = this.previousReport.stabilityScore;
    const currentScore = this.previousReport.stabilityScore;

    // Since we just ran, use execution stats
    if (currentScore > prevScore + 5) return 'improving';
    if (currentScore < prevScore - 5) return 'declining';
    return 'stable';
  }
}
