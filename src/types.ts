// types.ts — Shared type definitions for the Screener Crawler + Test Generator

/** Operating mode for the pipeline */
export type PipelineMode = 'crawl' | 'analyze' | 'generate' | 'full';

/** Crawl configuration */
export interface CrawlConfig {
  /** Starting URLs (seed) */
  seedUrls: string[];
  /** Maximum crawl depth from seed */
  maxDepth: number;
  /** Maximum total pages to crawl */
  maxPages: number;
  /** Allowed domains (empty = same as seed domain only) */
  allowedDomains: string[];
  /** URL patterns to exclude */
  excludePatterns: string[];
  /** Respect robots.txt */
  respectRobotsTxt: boolean;
  /** Delay between requests (ms) */
  requestDelayMs: number;
  /** Concurrent browser contexts */
  concurrency: number;
  /** Include query strings in URL normalization */
  stripQueryParams: string[];
  /** Authentication / custom headers */
  headers: Record<string, string>;
  /** Viewport for Playwright */
  viewport: { width: number; height: number };
  /** Timeout per page (ms) */
  pageTimeoutMs: number;
}

/** A discovered URL in the frontier */
export interface FrontierUrl {
  url: string;
  normalizedUrl: string;
  depth: number;
  priority: number;
  discoveredFrom: string;
  discoveredAt: Date;
  metadata: Record<string, unknown>;
}

/** A crawled page result */
export interface CrawledPage {
  url: string;
  normalizedUrl: string;
  title: string;
  statusCode: number;
  contentType: string;
  depth: number;
  crawledAt: Date;
  durationMs: number;
  contentHash: string;
  links: string[];
  metaTags: Record<string, string>;
  /** DOM statistics */
  domStats: DomStats;
  error?: string;
}

/** DOM statistics from analysis */
export interface DomStats {
  totalElements: number;
  interactiveElements: number;
  forms: number;
  links: number;
  images: number;
  headings: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  scripts: number;
  stylesheets: number;
}

/** An interactive element discovered on a page */
export interface InteractiveElement {
  selector: string;
  tagName: string;
  elementType: ElementType;
  text: string;
  attributes: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  isVisible: boolean;
  isEnabled: boolean;
  parentFormSelector?: string;
  aria: AriaInfo;
}

export type ElementType =
  | 'button' | 'link' | 'input' | 'select' | 'textarea'
  | 'checkbox' | 'radio' | 'file' | 'submit' | 'nav-link'
  | 'tab' | 'accordion' | 'modal-trigger' | 'tooltip-trigger'
  | 'drag-handle' | 'other';

/** ARIA accessibility info */
export interface AriaInfo {
  role: string | null;
  label: string | null;
  describedBy: string | null;
  expanded: boolean | null;
  selected: boolean | null;
  level: number | null;
  hasPopup: string | null;
  required: boolean;
  invalid: boolean;
}

/** A discovered form */
export interface DiscoveredForm {
  selector: string;
  action: string;
  method: string;
  fields: FormField[];
  submitButton: InteractiveElement | null;
  fieldCount: number;
  hasFileUpload: boolean;
  hasCaptcha: boolean;
}

/** A form field */
export interface FormField {
  selector: string;
  name: string;
  type: string;
  label: string;
  placeholder: string;
  required: boolean;
  maxLength: number | null;
  minLength: number | null;
  pattern: string | null;
  min: string | null;
  max: string | null;
  options: { value: string; text: string }[];
  defaultValue: string;
}

/** A discovered API endpoint */
export interface DiscoveredApi {
  url: string;
  method: string;
  statusCode: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: unknown;
  responseBody: unknown;
  durationMs: number;
  triggeredBy: string;
  pageUrl: string;
}

/** A discovered multi-step workflow */
export interface DiscoveredWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  startUrl: string;
  description: string;
  estimatedDurationMs: number;
}

export interface WorkflowStep {
  order: number;
  action: 'navigate' | 'click' | 'type' | 'select' | 'submit' | 'wait';
  targetSelector: string;
  value?: string;
  description: string;
  nextPageUrl?: string;
}

/** Generated test case */
export interface GeneratedTest {
  id: string;
  name: string;
  category: 'functional' | 'negative' | 'boundary' | 'accessibility' | 'visual' | 'security';
  description: string;
  steps: TestStep[];
  expectedResults: string[];
  sourcePage: string;
  sourceElement?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  tags: string[];
}

export interface TestStep {
  order: number;
  action: TestAction;
  target?: string;
  value?: string;
  assertion: Assertion;
  timeoutMs: number;
}

export type TestAction = 'goto' | 'click' | 'fill' | 'selectOption' | 'check' | 'uncheck'
  | 'pressKey' | 'hover' | 'waitForSelector' | 'waitForNavigation' | 'screenshot'
  | 'evaluate' | 'scrollIntoView';

export interface Assertion {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'attribute' | 'url' | 'title'
    | 'count' | 'enabled' | 'disabled' | 'checked' | 'unchecked' | 'focused'
    | 'accessible' | 'aria' | 'statusCode' | 'responseTime';
  target?: string;
  expected?: unknown;
  description: string;
}

/** Crawl report */
export interface CrawlReport {
  generatedAt: Date;
  config: CrawlConfig;
  stats: {
    totalDiscovered: number;
    totalCrawled: number;
    totalSkipped: number;
    totalErrors: number;
    crawlDurationMs: number;
    avgPageLoadMs: number;
  };
  pages: CrawledPage[];
  errors: { url: string; error: string; timestamp: Date }[];
  sitemapEntries: string[];
}

/** Coverage report */
export interface CoverageReport {
  generatedAt: Date;
  pagesAnalyzed: number;
  coverageByType: {
    forms: { total: number; tested: number; percentage: number };
    links: { total: number; tested: number; percentage: number };
    workflows: { total: number; tested: number; percentage: number };
    apis: { total: number; monitored: number; percentage: number };
    interactiveElements: { total: number; tested: number; percentage: number };
  };
  untestedPaths: string[];
  recommendations: string[];
}

/** Full analysis result */
export interface PageAnalysis {
  pageUrl: string;
  title: string;
  domStats: DomStats;
  interactiveElements: InteractiveElement[];
  forms: DiscoveredForm[];
  apis: DiscoveredApi[];
  workflows: DiscoveredWorkflow[];
  accessibilityIssues: AccessibilityIssue[];
  visualElements: VisualElement[];
  securityConcerns: SecurityConcern[];
}

export interface AccessibilityIssue {
  selector: string;
  rule: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  wcag: string;
  suggestion: string;
}

export interface VisualElement {
  selector: string;
  tagName: string;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  computedStyle: Record<string, string>;
  text: string;
  isImage: boolean;
}

export interface SecurityConcern {
  type: 'xss' | 'csrf' | 'cors' | 'csp' | 'clickjacking' | 'insecure-form' | 'exposed-token';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  evidence: string;
}

// ─── Pipeline v2 types (Steps 6-14) ───

/** Test execution result */
export interface TestResult {
  testId: string;
  testName: string;
  category: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  durationMs: number;
  retries: number;
  errorMessage?: string;
  errorStack?: string;
  screenshot?: string;
  video?: string;
  startedAt: Date;
  completedAt: Date;
  browser: string;
  viewport: string;
}

/** Execution run summary */
export interface ExecutionReport {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
  results: TestResult[];
  environment: {
    browser: string;
    viewport: string;
    os: string;
    nodeVersion: string;
  };
}

/** A failure with root cause analysis */
export interface FailureAnalysis {
  testId: string;
  testName: string;
  errorMessage: string;
  rootCause: RootCause;
  affectedElements: string[];
  suggestedFix: AutoHealAction | null;
  confidence: number; // 0-1
  similarFailures: string[];
  isEnvironmental: boolean;
  isSelectorIssue: boolean;
  isTimingIssue: boolean;
  isDataIssue: boolean;
  isApplicationBug: boolean;
}

export interface RootCause {
  category: 'selector-changed' | 'timeout' | 'element-not-found' | 'assertion-mismatch'
    | 'network-error' | 'auth-expired' | 'data-changed' | 'race-condition'
    | 'environment-issue' | 'application-error' | 'unknown';
  description: string;
  location: string;
  evidence: string;
}

/** Auto-heal action */
export interface AutoHealAction {
  type: 'update-selector' | 'increase-timeout' | 'add-wait' | 'retry-strategy'
    | 'update-assertion' | 'skip-test' | 'mark-flaky';
  target: string;
  originalValue: string;
  newValue: string;
  reason: string;
  autoApplied: boolean;
}

/** Healed test record */
export interface HealedTest {
  testId: string;
  originalSelector: string;
  healedSelector: string;
  healReason: string;
  healTimestamp: Date;
  successRate: number;
}

/** Coverage gap */
export interface CoverageGap {
  id: string;
  area: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedPages: string[];
  missingCoverage: string[];
  suggestedTestCount: number;
  riskIfUntested: string;
}

/** Regression test run result */
export interface RegressionReport {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  totalTests: number;
  passed: number;
  failed: number;
  newFailures: string[];
  fixedFailures: string[];
  durationMs: number;
  comparedToBaseline: string;
  stabilityScore: number; // 0-100
}

/** Release risk assessment */
export interface ReleaseRiskAssessment {
  assessmentId: string;
  assessedAt: Date;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  recommendation: 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
  confidence: number; // 0-1
  scores: {
    testPassRate: number;        // 0-100
    coverageScore: number;       // 0-100
    stabilityScore: number;      // 0-100
    securityScore: number;       // 0-100
    accessibilityScore: number;  // 0-100
    performanceScore: number;    // 0-100
  };
  topRisks: RiskItem[];
  blockingIssues: string[];
  warnings: string[];
  recommendations: string[];
  goNoGoRationale: string;
}

export interface RiskItem {
  category: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedArea: string;
  mitigation: string;
}

/** Pipeline step status */
export type PipelineStepStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface PipelineStep {
  order: number;
  name: string;
  status: PipelineStepStatus;
  durationMs: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  summary: string;
}

/** Full pipeline run */
export interface PipelineRun {
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  status: 'running' | 'completed' | 'failed';
  steps: PipelineStep[];
  applicationUnderTest: string;
  targets: string[];
  finalRecommendation?: 'GO' | 'CONDITIONAL_GO' | 'NO_GO';
}
