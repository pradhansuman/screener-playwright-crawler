// index.ts — Main entry point for the Screener Playwright Crawler

import { Crawler } from './crawler/crawler';
import { PageAnalyzer } from './analyzer/page-analyzer';
import { ActionDiscovery } from './analyzer/action-discovery';
import { FormAnalyzer } from './analyzer/form-analyzer';
import { ApiDiscovery } from './analyzer/api-discovery';
import { WorkflowDiscovery } from './analyzer/workflow-discovery';
import { FunctionalGenerator } from './generator/functional-generator';
import { NegativeGenerator } from './generator/negative-generator';
import { BoundaryGenerator } from './generator/boundary-generator';
import { AccessibilityGenerator } from './generator/accessibility-generator';
import { VisualGenerator } from './generator/visual-generator';
import { SecurityGenerator } from './generator/security-generator';
import { TestWriter } from './test-writer';
import { ReportGenerator } from './report-generator';
import { CrawlConfig, PageAnalysis, GeneratedTest, CrawlReport, CoverageReport, PipelineMode } from './types';
import { loadConfig } from './config';
import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const mode: PipelineMode = (process.argv.includes('--mode')
    ? process.argv[process.argv.indexOf('--mode') + 1]
    : 'full') as PipelineMode;

  const seedUrlsArg = process.argv.includes('--url')
    ? [process.argv[process.argv.indexOf('--url') + 1]]
    : undefined;

  const maxPagesArg = process.argv.includes('--max-pages')
    ? parseInt(process.argv[process.argv.indexOf('--max-pages') + 1])
    : undefined;

  const outputDir = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : path.join(__dirname, '..', 'generated-tests');

  console.log('🦞 Screener Playwright Crawler v2.0');
  console.log(`   Mode: ${mode}`);

  const config = loadConfig({
    ...(seedUrlsArg ? { seedUrls: seedUrlsArg } : {}),
    ...(maxPagesArg ? { maxPages: maxPagesArg } : {}),
  });

  if (mode === 'crawl' || mode === 'full') {
    await runCrawl(config, outputDir);
  }

  if (mode === 'analyze' || mode === 'full') {
    await runAnalyze(config, outputDir);
  }

  if (mode === 'generate' || mode === 'full') {
    await runGenerate(config, outputDir);
  }

  console.log('✅ Pipeline complete');
}

async function runCrawl(config: CrawlConfig, outputDir: string) {
  console.log('\n🔍 Phase 1: Crawling...');

  if (config.seedUrls.length === 0) {
    console.error('❌ No seed URLs provided. Use --url or configure SEED_URLS env var.');
    return;
  }

  const crawler = new Crawler(config);
  const report = await crawler.crawl();

  const reportsDir = path.join(outputDir, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, 'crawl-report.json'),
    JSON.stringify(report, null, 2)
  );

  console.log(`   ✅ Crawled ${report.stats.totalCrawled} pages`);
  console.log(`   ⏱️  Duration: ${(report.stats.crawlDurationMs / 1000).toFixed(1)}s`);
  console.log(`   ⚠️  Errors: ${report.stats.totalErrors}`);
  console.log(`   📄 Report: reports/crawl-report.json`);
}

async function runAnalyze(config: CrawlConfig, outputDir: string) {
  console.log('\n🔬 Phase 2: Analyzing...');

  const reportsDir = path.join(outputDir, '..', 'reports');
  const crawlReportPath = path.join(reportsDir, 'crawl-report.json');

  if (!fs.existsSync(crawlReportPath)) {
    console.error('❌ No crawl report found. Run crawl first.');
    return;
  }

  const crawlReport: CrawlReport = JSON.parse(fs.readFileSync(crawlReportPath, 'utf-8'));
  const analysesDir = path.join(outputDir, '..', 'analyses');
  fs.mkdirSync(analysesDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: config.viewport,
    userAgent: config.headers['User-Agent'] as string,
  });

  const analyzer = new PageAnalyzer(context);
  const actionDiscovery = new ActionDiscovery();
  const formAnalyzer = new FormAnalyzer();
  const apiDiscovery = new ApiDiscovery();
  const workflowDiscovery = new WorkflowDiscovery();

  const allAnalyses: PageAnalysis[] = [];

  for (let i = 0; i < crawlReport.pages.length; i++) {
    const page = crawlReport.pages[i];
    console.log(`   Analyzing ${i + 1}/${crawlReport.pages.length}: ${page.url}`);

    try {
      const pageObj = await context.newPage();
      apiDiscovery.attach(pageObj);
      await pageObj.goto(page.url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});

      const analysis = await analyzer.analyze(page.url);
      allAnalyses.push(analysis);

      // Save individual analysis
      const safeName = page.url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
      fs.writeFileSync(
        path.join(analysesDir, `${safeName}.json`),
        JSON.stringify(analysis, null, 2)
      );

      await pageObj.close();
    } catch (err: any) {
      console.log(`   ⚠️  Failed: ${err.message}`);
    }
  }

  // Save combined analyses
  fs.writeFileSync(
    path.join(analysesDir, 'all-analyses.json'),
    JSON.stringify(allAnalyses, null, 2)
  );

  await context.close();
  await browser.close();

  console.log(`   ✅ Analyzed ${allAnalyses.length} pages`);
  console.log(`   📄 Analyses: analyses/ (${allAnalyses.length} files)`);
}

async function runGenerate(config: CrawlConfig, outputDir: string) {
  console.log('\n🧪 Phase 3: Generating tests...');

  const analysesDir = path.join(outputDir, '..', 'analyses');
  const allAnalysesPath = path.join(analysesDir, 'all-analyses.json');

  if (!fs.existsSync(allAnalysesPath)) {
    console.log('   ⚠️  No analyses found, generating from crawl report instead');
    await generateFromCrawlReport(config, outputDir);
    return;
  }

  const allAnalyses: PageAnalysis[] = JSON.parse(fs.readFileSync(allAnalysesPath, 'utf-8'));

  const functionalGen = new FunctionalGenerator();
  const negativeGen = new NegativeGenerator();
  const boundaryGen = new BoundaryGenerator();
  const accessibilityGen = new AccessibilityGenerator();
  const visualGen = new VisualGenerator();
  const securityGen = new SecurityGenerator();

  const writer = new TestWriter(outputDir);
  const allTests: GeneratedTest[] = [];

  for (const analysis of allAnalyses) {
    const tests: GeneratedTest[] = [
      ...functionalGen.generate(analysis),
      ...negativeGen.generate(analysis),
      ...boundaryGen.generate(analysis),
      ...accessibilityGen.generate(analysis),
      ...visualGen.generate(analysis),
      ...securityGen.generate(analysis),
    ];

    allTests.push(...tests);
  }

  // Write tests to categorized directories
  writer.writeAll(allTests);

  // Generate reports
  const reportsDir = path.join(outputDir, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const reportGen = new ReportGenerator();
  const coverageReport = reportGen.generateCoverageReport(allAnalyses, allTests);
  fs.writeFileSync(
    path.join(reportsDir, 'coverage-report.json'),
    JSON.stringify(coverageReport, null, 2)
  );

  const qaReport = reportGen.generateQaReport(allAnalyses, allTests);
  fs.writeFileSync(
    path.join(reportsDir, 'qa-report.html'),
    qaReport
  );

  console.log(`   ✅ Generated ${allTests.length} tests`);
  console.log(`   📂 Categories:`);
  const byCategory = writer.getStats();
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`      ${cat}: ${count} tests`);
  }
  console.log(`   📄 Reports: reports/ (crawl-report.json, coverage-report.json, qa-report.html)`);
}

async function generateFromCrawlReport(config: CrawlConfig, outputDir: string) {
  // Simplified: generate basic tests from crawl data without full analysis
  const reportsDir = path.join(outputDir, '..', 'reports');
  const crawlReportPath = path.join(reportsDir, 'crawl-report.json');

  if (!fs.existsSync(crawlReportPath)) {
    console.error('❌ No crawl report found.');
    return;
  }

  const report: CrawlReport = JSON.parse(fs.readFileSync(crawlReportPath, 'utf-8'));
  const writer = new TestWriter(outputDir);
  const functionalGen = new FunctionalGenerator();
  const allTests: GeneratedTest[] = [];

  for (const page of report.pages) {
    // Create a minimal analysis from crawl data
    const minimalAnalysis: PageAnalysis = {
      pageUrl: page.url,
      title: page.title,
      domStats: page.domStats,
      interactiveElements: [],
      forms: [],
      apis: [],
      workflows: [],
      accessibilityIssues: [],
      visualElements: [],
      securityConcerns: [],
    };

    allTests.push(...functionalGen.generate(minimalAnalysis));
  }

  writer.writeAll(allTests);

  console.log(`   ✅ Generated ${allTests.length} basic tests`);
}

// Run
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
