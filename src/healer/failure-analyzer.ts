// failure-analyzer.ts — Steps 7-8: Analyze failures + Find root cause

import { TestResult, FailureAnalysis, RootCause, AutoHealAction } from '../types';

/**
 * Analyzes test failures using pattern matching to identify root causes.
 * Categories: selector changes, timeouts, missing elements, assertion mismatches,
 * network errors, auth expiry, data changes, race conditions.
 */
export class FailureAnalyzer {
  private analyses: FailureAnalysis[] = [];

  /**
   * Analyze all test failures from an execution report
   */
  analyze(failures: TestResult[]): FailureAnalysis[] {
    this.analyses = [];

    for (const failure of failures) {
      if (failure.status === 'passed' || failure.status === 'skipped') continue;

      // Skip if already analyzed
      const existing = this.analyses.find(a => a.testId === failure.testId);
      if (existing) continue;

      const analysis = this.analyzeFailure(failure);
      this.analyses.push(analysis);
    }

    return this.analyses;
  }

  /**
   * Analyze a single failure
   */
  private analyzeFailure(failure: TestResult): FailureAnalysis {
    const msg = failure.errorMessage || '';
    const rootCause = this.determineRootCause(msg, failure);
    const suggestedFix = this.suggestFix(rootCause, failure);
    const affectedElements = this.extractAffectedElements(msg);

    return {
      testId: failure.testId,
      testName: failure.testName,
      errorMessage: msg,
      rootCause,
      affectedElements,
      suggestedFix,
      confidence: this.calculateConfidence(rootCause, msg),
      similarFailures: this.findSimilarFailures(msg, failure),
      isEnvironmental: rootCause.category === 'environment-issue' || rootCause.category === 'network-error',
      isSelectorIssue: rootCause.category === 'selector-changed' || rootCause.category === 'element-not-found',
      isTimingIssue: rootCause.category === 'timeout' || rootCause.category === 'race-condition',
      isDataIssue: rootCause.category === 'data-changed',
      isApplicationBug: rootCause.category === 'application-error',
    };
  }

  /**
   * Pattern-match the error to identify root cause
   */
  private determineRootCause(msg: string, failure: TestResult): RootCause {
    const lower = msg.toLowerCase();

    // Selector-related
    if (lower.includes('selector') && lower.includes('not found')) {
      return {
        category: 'selector-changed',
        description: 'Element selector no longer matches any element on the page',
        location: this.extractSelector(msg),
        evidence: msg.slice(0, 200),
      };
    }
    if (lower.includes('element is detached')) {
      return {
        category: 'selector-changed',
        description: 'Element was removed or replaced between locating and interacting',
        location: this.extractSelector(msg),
        evidence: 'DOM mutation during test execution',
      };
    }

    // Timeout-related
    if (lower.includes('timeout') || lower.includes('timed out')) {
      if (lower.includes('navigation')) {
        return {
          category: 'timeout',
          description: 'Page navigation did not complete within timeout',
          location: failure.testName,
          evidence: msg.slice(0, 200),
        };
      }
      if (lower.includes('waitforselector') || lower.includes('waitfor')) {
        return {
          category: 'element-not-found',
          description: 'Expected element did not appear within timeout window',
          location: this.extractSelector(msg),
          evidence: 'Element not rendered or lazy-loaded after timeout',
        };
      }
      return {
        category: 'timeout',
        description: 'Operation exceeded maximum wait time',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Network errors
    if (lower.includes('net::') || lower.includes('connection') || lower.includes('network')) {
      return {
        category: 'network-error',
        description: 'Network request failed — possible server or connectivity issue',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Auth
    if (lower.includes('auth') || lower.includes('unauthorized') || lower.includes('401') || lower.includes('403')) {
      return {
        category: 'auth-expired',
        description: 'Authentication token expired or credentials invalid',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Assertion mismatch
    if (lower.includes('expected') && (lower.includes('received') || lower.includes('to be') || lower.includes('tohave'))) {
      return {
        category: 'assertion-mismatch',
        description: 'Actual value does not match expected assertion',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Race condition
    if (lower.includes('race') || lower.includes('concurrent') || lower.includes('stale')) {
      return {
        category: 'race-condition',
        description: 'Test encountered race condition — state changed during execution',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Data changes
    if (lower.includes('data') && (lower.includes('changed') || lower.includes('mismatch') || lower.includes('stale'))) {
      return {
        category: 'data-changed',
        description: 'Test data or fixtures changed since test was generated',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Environment
    if (lower.includes('environment') || lower.includes('config') || lower.includes('env')) {
      return {
        category: 'environment-issue',
        description: 'Test environment configuration issue',
        location: failure.testName,
        evidence: msg.slice(0, 200),
      };
    }

    // Default to application error
    return {
      category: 'application-error',
      description: 'Application returned unexpected behavior or error state',
      location: failure.testName,
      evidence: msg.slice(0, 200),
    };
  }

  /**
   * Suggest an auto-heal action based on root cause
   */
  private suggestFix(rootCause: RootCause, failure: TestResult): AutoHealAction | null {
    switch (rootCause.category) {
      case 'selector-changed':
        return {
          type: 'update-selector',
          target: rootCause.location,
          originalValue: rootCause.location,
          newValue: this.proposeAlternativeSelector(rootCause.location),
          reason: 'Original selector no longer valid — propose alternative',
          autoApplied: false,
        };

      case 'element-not-found':
        return {
          type: 'add-wait',
          target: rootCause.location,
          originalValue: 'waitUntil: domcontentloaded',
          newValue: 'waitUntil: networkidle + waitForSelector',
          reason: 'Element may be loaded asynchronously — add explicit wait',
          autoApplied: false,
        };

      case 'timeout':
        return {
          type: 'increase-timeout',
          target: rootCause.location,
          originalValue: '30000',
          newValue: '60000',
          reason: 'Operation needs more time — double timeout',
          autoApplied: false,
        };

      case 'race-condition':
        return {
          type: 'retry-strategy',
          target: failure.testId,
          originalValue: 'retries: 0',
          newValue: 'retries: 2',
          reason: 'Race condition detected — add retry with exponential backoff',
          autoApplied: false,
        };

      case 'assertion-mismatch':
        return {
          type: 'update-assertion',
          target: failure.testId,
          originalValue: 'exact match assertion',
          newValue: 'contains / loose match assertion',
          reason: 'Assertion too strict — relax to contains match',
          autoApplied: false,
        };

      case 'network-error':
        return {
          type: 'retry-strategy',
          target: failure.testId,
          originalValue: 'retries: 0',
          newValue: 'retries: 3',
          reason: 'Network flakiness — add aggressive retry',
          autoApplied: false,
        };

      case 'auth-expired':
        return {
          type: 'skip-test',
          target: failure.testId,
          originalValue: 'active',
          newValue: 'skipped',
          reason: 'Auth expired — skip until credentials refreshed',
          autoApplied: false,
        };

      default:
        return null;
    }
  }

  /**
   * Propose an alternative selector
   */
  private proposeAlternativeSelector(current: string): string {
    // Try data-testid first
    if (!current.includes('data-testid')) {
      return current.replace(/^[.#]/, '[data-testid="') + '"]';
    }
    // Try aria-label
    if (!current.includes('aria-label')) {
      return `[aria-label="${current.replace(/[^a-zA-Z0-9 ]/g, '')}"]`;
    }
    return current;
  }

  /**
   * Extract selector from error message
   */
  private extractSelector(msg: string): string {
    const match = msg.match(/["']([^"']+selector[^"']+|[^"']{2,50})["']/);
    return match ? match[1] : 'unknown-selector';
  }

  /**
   * Extract affected elements from error message
   */
  private extractAffectedElements(msg: string): string[] {
    const elements: string[] = [];
    const selectorRegex = /waitForSelector\("([^"]+)"\)/g;
    let match;
    while ((match = selectorRegex.exec(msg)) !== null) {
      elements.push(match[1]);
    }
    return elements.length > 0 ? elements : ['unknown-element'];
  }

  /**
   * Find tests with similar errors (same error category)
   */
  private findSimilarFailures(msg: string, current: TestResult): string[] {
    return this.analyses
      .filter(a => a.rootCause.category === this.determineRootCause(msg, current).category)
      .map(a => a.testId);
  }

  /**
   * Calculate confidence in the root cause analysis (0-1)
   */
  private calculateConfidence(rootCause: RootCause, msg: string): number {
    const strongSignals = [
      'selector', 'timeout', 'net::', '401', '403',
      'expected', 'received', 'element is detached',
    ];

    const hits = strongSignals.filter(s => msg.toLowerCase().includes(s.toLowerCase()));
    return Math.min(0.95, 0.5 + hits.length * 0.15);
  }

  /**
   * Get summary statistics
   */
  getSummary() {
    const byCategory: Record<string, number> = {};
    for (const a of this.analyses) {
      byCategory[a.rootCause.category] = (byCategory[a.rootCause.category] || 0) + 1;
    }

    return {
      totalFailures: this.analyses.length,
      environmentalFailures: this.analyses.filter(a => a.isEnvironmental).length,
      selectorIssues: this.analyses.filter(a => a.isSelectorIssue).length,
      timingIssues: this.analyses.filter(a => a.isTimingIssue).length,
      dataIssues: this.analyses.filter(a => a.isDataIssue).length,
      applicationBugs: this.analyses.filter(a => a.isApplicationBug).length,
      healableFailures: this.analyses.filter(a => a.suggestedFix !== null).length,
      byCategory,
      avgConfidence: this.analyses.length > 0
        ? Math.round(this.analyses.reduce((s, a) => s + a.confidence, 0) / this.analyses.length * 100)
        : 0,
    };
  }
}
