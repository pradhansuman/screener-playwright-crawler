// risk-assessor.ts — Steps 13-14: Assess release risk + GO/NO-GO recommendation

import {
  ExecutionReport, RegressionReport, CoverageGap, CoverageReport,
  PageAnalysis, ReleaseRiskAssessment, RiskItem, FailureAnalysis,
} from '../types';

/**
 * Assesses release risk across multiple dimensions and provides
 * a data-driven GO / CONDITIONAL_GO / NO_GO recommendation.
 */
export class RiskAssessor {
  /**
   * Assess overall release risk
   */
  assess(options: {
    execution: ExecutionReport;
    regression: RegressionReport;
    gaps: CoverageGap[];
    coverage: CoverageReport;
    analyses: PageAnalysis[];
    failureAnalysis?: FailureAnalysis[];
  }): ReleaseRiskAssessment {
    const {
      execution, regression, gaps, coverage, analyses, failureAnalysis,
    } = options;

    // Calculate dimension scores (0-100)
    const testPassRate = execution.totalTests > 0
      ? Math.round((execution.passed / execution.totalTests) * 100)
      : 0;

    const coverageScore = this.calculateCoverageScore(coverage);

    const stabilityScore = regression.stabilityScore;

    const securityScore = this.calculateSecurityScore(analyses);

    const accessibilityScore = this.calculateAccessibilityScore(analyses);

    const performanceScore = this.estimatePerformanceScore(execution);

    // Calculate weighted overall score
    const overall = Math.round(
      testPassRate * 0.30 +
      coverageScore * 0.20 +
      stabilityScore * 0.15 +
      securityScore * 0.15 +
      accessibilityScore * 0.10 +
      performanceScore * 0.10
    );

    // Determine risk level
    const overallRisk = this.determineRiskLevel(overall);

    // Collect risks
    const risks = this.collectRisks(options);

    // Identify blocking issues
    const blockingIssues = this.identifyBlockers(risks);

    // Generate warnings
    const warnings = this.generateWarnings(options);

    // Make recommendation
    const recommendation = this.makeRecommendation(
      overallRisk, blockingIssues, overall, testPassRate,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(options);

    // Build rationale
    const rationale = this.buildRationale(recommendation, options);

    return {
      assessmentId: `risk-${Date.now()}`,
      assessedAt: new Date(),
      overallRisk,
      recommendation,
      confidence: this.calculateConfidence(options),
      scores: {
        testPassRate,
        coverageScore,
        stabilityScore,
        securityScore,
        accessibilityScore,
        performanceScore,
      },
      topRisks: risks.slice(0, 5),
      blockingIssues,
      warnings,
      recommendations,
      goNoGoRationale: rationale,
    };
  }

  private calculateCoverageScore(coverage: CoverageReport): number {
    const scores = Object.values(coverage.coverageByType).map(c => c.percentage);
    if (scores.length === 0) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  private calculateSecurityScore(analyses: PageAnalysis[]): number {
    const concerns = analyses.flatMap(a => a.securityConcerns);
    if (concerns.length === 0) return 100;

    let score = 100;
    const critical = concerns.filter(c => c.severity === 'critical').length;
    const high = concerns.filter(c => c.severity === 'high').length;
    const medium = concerns.filter(c => c.severity === 'medium').length;
    const low = concerns.filter(c => c.severity === 'low').length;

    score -= critical * 25;
    score -= high * 10;
    score -= medium * 4;
    score -= low * 1;

    return Math.max(0, score);
  }

  private calculateAccessibilityScore(analyses: PageAnalysis[]): number {
    const issues = analyses.flatMap(a => a.accessibilityIssues);
    if (issues.length === 0) return 100;

    let score = 100;
    const critical = issues.filter(i => i.impact === 'critical').length;
    const serious = issues.filter(i => i.impact === 'serious').length;
    const moderate = issues.filter(i => i.impact === 'moderate').length;
    const minor = issues.filter(i => i.impact === 'minor').length;

    score -= critical * 20;
    score -= serious * 8;
    score -= moderate * 3;
    score -= minor * 1;

    return Math.max(0, score);
  }

  private estimatePerformanceScore(execution: ExecutionReport): number {
    const avgDuration = execution.totalTests > 0
      ? execution.durationMs / execution.totalTests
      : 0;

    if (avgDuration < 1000) return 95;
    if (avgDuration < 3000) return 85;
    if (avgDuration < 5000) return 70;
    if (avgDuration < 10000) return 50;
    return 30;
  }

  private determineRiskLevel(score: number): ReleaseRiskAssessment['overallRisk'] {
    if (score >= 90) return 'low';
    if (score >= 70) return 'medium';
    if (score >= 50) return 'high';
    return 'critical';
  }

  private collectRisks(options: any): RiskItem[] {
    const risks: RiskItem[] = [];

    // Failed tests risk
    if (options.execution.failed > 0) {
      risks.push({
        category: 'Test Failures',
        description: `${options.execution.failed} tests failed in latest execution`,
        severity: options.execution.failed > options.execution.totalTests * 0.2 ? 'critical' : 'high',
        affectedArea: 'Functional',
        mitigation: 'Analyze failures, fix root causes, re-run',
      });
    }

    // New regression risk
    if (options.regression.newFailures.length > 0) {
      risks.push({
        category: 'Regressions',
        description: `${options.regression.newFailures.length} new test failures (regressions)`,
        severity: 'high',
        affectedArea: 'Multiple',
        mitigation: 'Investigate regressions — may indicate recent code changes broke functionality',
      });
    }

    // Coverage gap risk
    if (options.gaps.length > 0) {
      const criticalGaps = options.gaps.filter((g: CoverageGap) => g.severity === 'critical');
      if (criticalGaps.length > 0) {
        risks.push({
          category: 'Coverage Gaps',
          description: `${criticalGaps.length} critical coverage gaps with untested features`,
          severity: 'critical',
          affectedArea: criticalGaps[0].area,
          mitigation: `Add ${criticalGaps.reduce((s: number, g: CoverageGap) => s + g.suggestedTestCount, 0)} tests for uncovered areas`,
        });
      }
    }

    // Security risks
    const securityConcerns = options.analyses.flatMap((a: PageAnalysis) => a.securityConcerns);
    const critSec = securityConcerns.filter((s: any) => s.severity === 'critical');
    if (critSec.length > 0) {
      risks.push({
        category: 'Security',
        description: `${critSec.length} critical security concerns`,
        severity: 'critical',
        affectedArea: 'Security',
        mitigation: 'Address all critical security issues before release',
      });
    }

    // Stability risk
    if (options.regression.stabilityScore < 70) {
      risks.push({
        category: 'Stability',
        description: `Low stability score: ${options.regression.stabilityScore}/100`,
        severity: 'high',
        affectedArea: 'Reliability',
        mitigation: 'Fix flaky tests and stabilize automation',
      });
    }

    return risks;
  }

  private identifyBlockers(risks: RiskItem[]): string[] {
    return risks
      .filter(r => r.severity === 'critical')
      .map(r => `${r.category}: ${r.description}`);
  }

  private generateWarnings(options: any): string[] {
    const warnings: string[] = [];

    if (options.coverage.coverageByType.forms && options.coverage.coverageByType.forms.percentage < 60) {
      warnings.push('Form coverage below 60% — consider adding more form validation tests');
    }
    if (options.regression.stabilityScore < 80) {
      warnings.push('Test suite stability below 80% — investigate flaky tests');
    }
    if (options.execution.flaky > 0) {
      warnings.push(`${options.execution.flaky} flaky tests detected — review for reliability`);
    }
    if (options.gaps.length > 5) {
      warnings.push(`${options.gaps.length} coverage gaps identified — expand test coverage`);
    }

    return warnings;
  }

  private makeRecommendation(
    risk: ReleaseRiskAssessment['overallRisk'],
    blockers: string[],
    overallScore: number,
    passRate: number,
  ): ReleaseRiskAssessment['recommendation'] {
    if (blockers.length > 0 || risk === 'critical') return 'NO_GO';
    if (passRate < 80 || overallScore < 70) return 'CONDITIONAL_GO';
    return 'GO';
  }

  private generateRecommendations(options: any): string[] {
    const recs: string[] = [];

    const { execution, regression, gaps } = options;

    if (execution.failed > 0) {
      recs.push(`Fix ${execution.failed} failing tests before next release`);
    }
    if (regression.newFailures.length > 0) {
      recs.push(`Investigate ${regression.newFailures.length} new regressions`);
    }
    if (gaps.length > 0) {
      recs.push(`Create ${gaps.reduce((s: number, g: CoverageGap) => s + g.suggestedTestCount, 0)} missing tests`);
    }
    if (regression.stabilityScore < 85) {
      recs.push('Stabilize test suite — target >85 stability score');
    }
    if (recs.length === 0) {
      recs.push('Proceed with release — no critical issues found');
    }

    return recs;
  }

  private buildRationale(
    recommendation: string,
    options: any,
  ): string {
    const { execution, regression } = options;
    const passRate = execution.totalTests > 0
      ? Math.round((execution.passed / execution.totalTests) * 100)
      : 0;

    const parts = [
      `${execution.passed}/${execution.totalTests} tests passed (${passRate}%)`,
      `Stability: ${regression.stabilityScore}/100`,
      `${regression.newFailures.length} new failures, ${regression.fixedFailures.length} fixes`,
    ];

    if (recommendation === 'GO') {
      parts.unshift('✅ GO — All quality gates passed.');
    } else if (recommendation === 'CONDITIONAL_GO') {
      parts.unshift('⚠️ CONDITIONAL GO — Release with caveats.');
    } else {
      parts.unshift('🛑 NO-GO — Critical issues must be resolved.');
    }

    return parts.join(' | ');
  }

  private calculateConfidence(options: any): number {
    const { execution, analyses } = options;
    // More data = higher confidence
    let confidence = 0.5;
    if (execution.totalTests > 50) confidence += 0.15;
    if (execution.totalTests > 100) confidence += 0.1;
    if (analyses.length > 10) confidence += 0.1;
    if (analyses.length > 30) confidence += 0.1;
    return Math.min(0.95, confidence);
  }
}
