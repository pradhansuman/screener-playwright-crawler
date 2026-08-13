// pipeline.ts — Full 14-step E2E testing pipeline orchestrator

import {
  CrawlConfig, PageAnalysis, GeneratedTest, CrawlReport,
  CoverageReport, ExecutionReport, FailureAnalysis, CoverageGap,
  RegressionReport, ReleaseRiskAssessment, PipelineRun, PipelineStep,
} from './types';
import { Crawler } from './crawler/crawler';
import { PageAnalyzer } from './analyzer/page-analyzer';
import { FunctionalGenerator } from './generator/functional-generator';
import { NegativeGenerator } from './generator/negative-generator';
import { BoundaryGenerator } from './generator/boundary-generator';
import { AccessibilityGenerator } from './generator/accessibility-generator';
import { VisualGenerator } from './generator/visual-generator';
import { SecurityGenerator } from './generator/security-generator';
import { TestExecutor } from './executor/test-executor';
import { FailureAnalyzer } from './healer/failure-analyzer';
import { AutoHealer } from './healer/auto-healer';
import { GapDetector } from './gap-detector';
import { RegressionRunner } from './regression-runner';
import { RiskAssessor } from './risk-assessor';
import { TestWriter } from './test-writer';
import { ReportGenerator } from './report-generator';
import { chromium } from 'playwright';
import { loadConfig } from './config';
import * as fs from 'fs';
import * as path from 'path';

const STEPS = [
  'Understand Application',
  'Understand Requirements',
  'Discover Workflows',
  'Generate Tests',
  'Prioritize Tests',
  'Execute Tests',
  'Analyze Failures',
  'Find Root Cause',
  'Heal Automation',
  'Detect Coverage Gaps',
  'Create Missing Tests',
  'Run Regression',
  'Assess Release Risk',
  'Recommend GO / NO-GO',
];

export class Pipeline {
  private config: CrawlConfig;
  private outputDir: string;
  private steps: PipelineStep[] = [];
  private analyses: PageAnalysis[] = [];
  private allTests: GeneratedTest[] = [];
  private executionReport: ExecutionReport | null = null;
  private failureAnalyses: FailureAnalysis[] = [];
  private coverageGaps: CoverageGap[] = [];
  private regressionReport: RegressionReport | null = null;
  private riskAssessment: ReleaseRiskAssessment | null = null;
  private coverageReport: CoverageReport | null = null;

  constructor(config: CrawlConfig, outputDir: string) {
    this.config = config;
    this.outputDir = outputDir;
    this.steps = STEPS.map((name, i) => ({
      order: i + 1,
      name,
      status: 'pending',
      durationMs: 0,
      summary: 'Waiting...',
    }));
  }

  /**
   * Run the full 14-step pipeline
   */
  async run(): Promise<PipelineRun> {
    const run: PipelineRun = {
      runId: `pipeline-${Date.now()}`,
      startedAt: new Date(),
      status: 'running',
      steps: this.steps,
      applicationUnderTest: this.config.seedUrls[0] || 'unknown',
      targets: this.config.seedUrls,
    };

    try {
      // ─── Step 1: Understand Application ───
      await this.executeStep(1, async () => {
        const summary = this.config.seedUrls.length > 0
          ? `Analyzing target: ${this.config.seedUrls.join(', ')}`
          : 'No target configured — use --url to set';
        return summary;
      });

      // ─── Step 2: Understand Requirements ───
      await this.executeStep(2, async () => {
        const reqs = [
          'Functional correctness (all features work as expected)',
          'Input validation & error handling',
          'Boundary conditions & edge cases',
          'WCAG 2.1 accessibility compliance',
          'Responsive visual integrity',
          'Security (OWASP Top 10)',
          'Cross-browser compatibility',
        ];
        return `Identified ${reqs.length} requirement categories`;
      });

      // ─── Step 3: Discover Workflows ───
      await this.executeStep(3, async () => {
        // Run crawler to discover pages
        const crawler = new Crawler(this.config);
        const crawlReport = await crawler.crawl();

        // Save crawl report
        const reportsDir = path.join(this.outputDir, '..', 'reports');
        fs.mkdirSync(reportsDir, { recursive: true });
        fs.writeFileSync(
          path.join(reportsDir, 'crawl-report.json'),
          JSON.stringify(crawlReport, null, 2),
        );

        // Run analyzer on crawled pages
        this.analyses = [];
        if (crawlReport.pages.length > 0) {
          const browser = await chromium.launch({ headless: true });
          const ctx = await browser.newContext({ viewport: this.config.viewport });
          const analyzer = new PageAnalyzer(ctx);

          for (const page of crawlReport.pages.slice(0, 20)) {
            try {
              const analysis = await analyzer.analyze(page.url);
              this.analyses.push(analysis);
            } catch { /* skip failed pages */ }
          }

          await ctx.close();
          await browser.close();
        }

        // Fallback: if crawler found nothing, create minimal analyses from seed URLs via fetch
        if (this.analyses.length === 0) {
          for (const seedUrl of this.config.seedUrls) {
            try {
              const resp = await fetch(seedUrl, { signal: AbortSignal.timeout(15000) });
              const html = await resp.text();
              const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
              this.analyses.push({
                pageUrl: seedUrl,
                title: titleMatch ? titleMatch[1] : seedUrl,
                domStats: {
                  totalElements: 0, interactiveElements: 0, forms: 0, links: 0, images: 0,
                  headings: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
                  scripts: 0, stylesheets: 0,
                },
                interactiveElements: [],
                forms: [],
                apis: [],
                workflows: [],
                accessibilityIssues: [],
                visualElements: [],
                securityConcerns: [],
              });
            } catch { /* skip unreachable seeds */ }
          }
        }

        const totalWorkflows = this.analyses
          .reduce((s, a) => s + a.workflows.length, 0);
        const totalForms = this.analyses
          .reduce((s, a) => s + a.forms.length, 0);

        return `${crawlReport.pages.length} pages · ${totalWorkflows} workflows · ${totalForms} forms`;
      });

      if (this.analyses.length === 0) {
        this.updateStepStatus(3, 'failed', 'No pages discovered — check seed URL');
        run.status = 'failed';
        return run;
      }

      // ─── Step 4: Generate Tests ───
      await this.executeStep(4, async () => {
        const funcGen = new FunctionalGenerator();
        const negGen = new NegativeGenerator();
        const boundGen = new BoundaryGenerator();
        const a11yGen = new AccessibilityGenerator();
        const visGen = new VisualGenerator();
        const secGen = new SecurityGenerator();

        this.allTests = [];
        for (const analysis of this.analyses) {
          this.allTests.push(
            ...funcGen.generate(analysis),
            ...negGen.generate(analysis),
            ...boundGen.generate(analysis),
            ...a11yGen.generate(analysis),
            ...visGen.generate(analysis),
            ...secGen.generate(analysis),
          );
        }

        // Write tests
        const writer = new TestWriter(this.outputDir);
        writer.writeAll(this.allTests);

        return `${this.allTests.length} test specs generated`;
      });

      // ─── Step 5: Prioritize Tests ───
      await this.executeStep(5, () => {
        // Tests already have priority from generators
        const critical = this.allTests.filter(t => t.priority === 'critical').length;
        const high = this.allTests.filter(t => t.priority === 'high').length;
        const medium = this.allTests.filter(t => t.priority === 'medium').length;
        const low = this.allTests.filter(t => t.priority === 'low').length;

        return `${critical} critical · ${high} high · ${medium} medium · ${low} low`;
      });

      // ─── Step 6: Execute Tests ───
      await this.executeStep(6, async () => {
        const executor = new TestExecutor();
        this.executionReport = await executor.execute(this.allTests);
        return `${this.executionReport.passed}/${this.executionReport.totalTests} passed`;
      });

      // ─── Step 7: Analyze Failures ───
      await this.executeStep(7, () => {
        const failures = this.executionReport!.results.filter(r => r.status === 'failed');
        const analyzer = new FailureAnalyzer();
        this.failureAnalyses = analyzer.analyze(failures);
        return `${this.failureAnalyses.length} failures analyzed`;
      });

      // ─── Step 8: Find Root Cause ───
      await this.executeStep(8, () => {
        const byCategory: Record<string, number> = {};
        for (const fa of this.failureAnalyses) {
          byCategory[fa.rootCause.category] = (byCategory[fa.rootCause.category] || 0) + 1;
        }

        const topCause = Object.entries(byCategory)
          .sort(([, a], [, b]) => b - a)[0];

        return topCause
          ? `Top cause: ${topCause[0]} (${topCause[1]} failures)`
          : 'No failures to analyze';
      });

      // ─── Step 9: Heal Automation ───
      await this.executeStep(9, async () => {
        const healer = new AutoHealer(this.outputDir);
        const healed = await healer.heal(this.failureAnalyses);
        const summary = healer.getSummary();
        return `${healed.length} tests healed · ${summary.autoApplied} auto-applied`;
      });

      // ─── Step 10: Detect Coverage Gaps ───
      await this.executeStep(10, () => {
        const detector = new GapDetector();
        this.coverageGaps = detector.detect(
          this.analyses,
          this.allTests,
          this.executionReport!,
        );
        return `${this.coverageGaps.length} gaps · ${detector.estimateNewTests(this.coverageGaps)} tests needed`;
      });

      // ─── Step 11: Create Missing Tests ───
      await this.executeStep(11, () => {
        const runner = new RegressionRunner();
        const newTests = runner.createMissingTests(
          this.analyses,
          this.coverageGaps,
          this.outputDir,
        );

        // Add to test suite
        this.allTests.push(...newTests);

        return `${newTests.length} new tests created for gaps`;
      });

      // ─── Step 12: Run Regression ───
      await this.executeStep(12, async () => {
        const runner = new RegressionRunner();
        const regReport = await runner.runRegression(this.allTests);
        this.regressionReport = regReport;
        const trend = runner.getTrend();
        return `${regReport.passed}/${regReport.totalTests} · Trend: ${trend}`;
      });

      // ─── Step 13: Assess Release Risk ───
      await this.executeStep(13, () => {
        try {
          // Build coverage report
          const reportGen = new ReportGenerator();
          this.coverageReport = reportGen.generateCoverageReport(this.analyses, this.allTests);

          const assessor = new RiskAssessor();
          const riskResult = assessor.assess({
            execution: this.executionReport as ExecutionReport,
            regression: this.regressionReport as RegressionReport,
            gaps: this.coverageGaps,
            coverage: this.coverageReport,
            analyses: this.analyses,
            failureAnalysis: this.failureAnalyses,
          });

          this.riskAssessment = riskResult;
          return `Risk: ${riskResult.overallRisk.toUpperCase()} · Score: ${this.calculateOverallScore()}%`;
        } catch (err: any) {
          return `Risk assessment skipped: ${err.message}`;
        }
      });

      // ─── Step 14: Recommend GO / NO-GO ───
      await this.executeStep(14, () => {
        const risk = this.riskAssessment;
        if (!risk) return 'Risk assessment unavailable — manual review recommended';
        const recommendation = risk.recommendation;
        const emoji = recommendation === 'GO' ? '✅' :
          recommendation === 'CONDITIONAL_GO' ? '⚠️' : '🛑';
        return `${emoji} ${recommendation.replace(/_/g, ' ')}`;
      });

      run.status = this.riskAssessment?.recommendation === 'NO_GO'
        ? 'failed' : 'completed';
      run.finalRecommendation = this.riskAssessment?.recommendation;

      // Save final report
      this.saveResults(run);

    } catch (err: any) {
      run.status = 'failed';
      const currentStep = this.steps.find(s => s.status === 'running');
      if (currentStep) {
        currentStep.status = 'failed';
        currentStep.error = err.message;
      }
    }

    run.completedAt = new Date();
    return run;
  }

  /**
   * Execute a single pipeline step with timing
   */
  private async executeStep(order: number, fn: () => Promise<string> | string): Promise<void> {
    const step = this.steps.find(s => s.order === order)!;
    step.status = 'running';
    step.startedAt = new Date();

    const start = Date.now();
    try {
      const summary = await fn();
      step.status = 'passed';
      step.summary = summary;
    } catch (err: any) {
      step.status = 'failed';
      step.summary = err.message;
      step.error = err.message;
      throw err;
    } finally {
      step.completedAt = new Date();
      step.durationMs = Date.now() - start;
    }
  }

  private updateStepStatus(order: number, status: PipelineStep['status'], summary: string): void {
    const step = this.steps.find(s => s.order === order);
    if (step) {
      step.status = status;
      step.summary = summary;
    }
  }

  private calculateOverallScore(): number {
    if (!this.riskAssessment) return 0;
    const s = this.riskAssessment.scores;
    return Math.round(
      s.testPassRate * 0.3 + s.coverageScore * 0.25 +
      s.stabilityScore * 0.15 + s.securityScore * 0.15 +
      s.accessibilityScore * 0.1 + s.performanceScore * 0.05
    );
  }

  /**
   * Get the pipeline results
   */
  getResults() {
    return {
      analyses: this.analyses,
      tests: this.allTests,
      execution: this.executionReport,
      failures: this.failureAnalyses,
      gaps: this.coverageGaps,
      regression: this.regressionReport,
      risk: this.riskAssessment,
      coverage: this.coverageReport,
    };
  }

  /**
   * Save all results to disk
   */
  private saveResults(run: PipelineRun): void {
    const reportsDir = path.join(this.outputDir, '..', 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    // Save pipeline run
    fs.writeFileSync(
      path.join(reportsDir, 'pipeline-run.json'),
      JSON.stringify(run, null, 2),
    );

    // Save execution report
    if (this.executionReport) {
      fs.writeFileSync(
        path.join(reportsDir, 'execution-report.json'),
        JSON.stringify(this.executionReport, null, 2),
      );
    }

    // Save regression report
    if (this.regressionReport) {
      fs.writeFileSync(
        path.join(reportsDir, 'regression-report.json'),
        JSON.stringify(this.regressionReport, null, 2),
      );
    }

    // Save coverage report
    if (this.coverageReport) {
      fs.writeFileSync(
        path.join(reportsDir, 'coverage-report.json'),
        JSON.stringify(this.coverageReport, null, 2),
      );
    }

    // Save risk assessment
    if (this.riskAssessment) {
      fs.writeFileSync(
        path.join(reportsDir, 'risk-assessment.json'),
        JSON.stringify(this.riskAssessment, null, 2),
      );
    }

    // Generate HTML QA report
    if (this.analyses.length > 0 && this.allTests.length > 0) {
      const reportGen = new ReportGenerator();
      const qaHtml = reportGen.generateQaReport(this.analyses, this.allTests);
      fs.writeFileSync(
        path.join(reportsDir, 'qa-report.html'),
        qaHtml,
      );
    }
  }
}

// ─── CLI Entry Point ───
if (require.main === module) {
  (async () => {
    const urlIdx = process.argv.indexOf('--url');
    const url = urlIdx >= 0 ? process.argv[urlIdx + 1] : null;
    if (!url) {
      console.error('Usage: ts-node src/pipeline.ts --url <https://example.com> [--max-pages <n>]');
      process.exit(1);
    }

    const maxIdx = process.argv.indexOf('--max-pages');
    const maxPages = maxIdx >= 0 ? parseInt(process.argv[maxIdx + 1]) : 10;

    const config = loadConfig({ seedUrls: [url], maxPages });
    const outputDir = path.join(__dirname, '..', 'generated-tests');

    console.log(`🦞 Screener Pipeline — ${url}`);
    console.log(`   Max pages: ${maxPages}`);

    const pipeline = new Pipeline(config, outputDir);
    const run = await pipeline.run();

    console.log(`\n📊 Pipeline complete: ${run.status.toUpperCase()}`);
    console.log(`   Final recommendation: ${run.finalRecommendation || 'N/A'}`);
    console.log(`   Duration: ${((run.completedAt?.getTime() || Date.now()) - run.startedAt.getTime()) / 1000}s`);

    for (const step of run.steps) {
      const icon = step.status === 'passed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
      console.log(`   ${icon} Step ${step.order}: ${step.name} — ${step.summary} (${(step.durationMs / 1000).toFixed(1)}s)`);
    }

    const results = pipeline.getResults();
    if (results.risk) {
      const r = results.risk;
      console.log(`\n🎯 Release Assessment:`);
      console.log(`   Risk Level: ${r.overallRisk.toUpperCase()}`);
      console.log(`   Recommendation: ${r.recommendation}`);
      console.log(`   Pass Rate: ${r.scores.testPassRate}% | Coverage: ${r.scores.coverageScore}% | Stability: ${r.scores.stabilityScore}%`);
      console.log(`   Security: ${r.scores.securityScore}% | A11y: ${r.scores.accessibilityScore}% | Perf: ${r.scores.performanceScore}%`);
      if (r.blockingIssues.length > 0) {
        console.log(`\n   🚫 Blockers:`);
        r.blockingIssues.forEach(b => console.log(`      - ${b}`));
      }
      console.log(`\n   📝 Rationale: ${r.goNoGoRationale}`);
    }

    console.log('\n📄 Reports written to reports/');
  })().catch(err => {
    console.error('❌ Pipeline failed:', err.message);
    process.exit(1);
  });
}
