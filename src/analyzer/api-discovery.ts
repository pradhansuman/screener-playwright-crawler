// api-discovery.ts — Monitor and catalog API calls made by the page

import { Page } from 'playwright';
import { DiscoveredApi } from '../types';

interface ApiEndpoint {
  method: string;
  pathPattern: string;
  occurrences: number;
  exampleUrl: string;
  requestHeaders: string[];
  responseTypes: string[];
  statusCodes: number[];
  domains: string[];
}

/**
 * API Discovery via Playwright network interception.
 * Monitors all XHR/fetch calls and catalogs API endpoints.
 */
export class ApiDiscovery {
  private endpoints = new Map<string, ApiEndpoint>();
  private calls: DiscoveredApi[] = [];

  /**
   * Start monitoring network on a page
   */
  attach(page: Page): void {
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      if (resourceType !== 'xhr' && resourceType !== 'fetch') return;

      // Start timing
      (request as any).__startTime = Date.now();
    });

    page.on('response', async (response) => {
      const request = response.request();
      const resourceType = request.resourceType();

      if (resourceType !== 'xhr' && resourceType !== 'fetch') return;

      const method = request.method();
      const fullUrl = response.url();
      const durationMs = Date.now() - ((request as any).__startTime || Date.now());

      // Parse URL for pattern matching
      let urlObj: URL;
      try {
        urlObj = new URL(fullUrl);
      } catch {
        return;
      }

      // Generate a path pattern (replace IDs, UUIDs, numbers with placeholders)
      const pathPattern = this.normalizePath(urlObj.pathname);

      const key = `${method}:${pathPattern}`;

      // Read response body for JSON APIs
      let responseBody: unknown = null;
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          responseBody = await response.json().catch(() => null);
        }
      } catch { /* skip */ }

      const apiCall: DiscoveredApi = {
        url: fullUrl,
        method,
        statusCode: response.status(),
        requestHeaders: request.headers(),
        responseHeaders: response.headers(),
        requestBody: request.postDataJSON() ?? null,
        responseBody,
        durationMs,
        triggeredBy: page.url(),
        pageUrl: page.url(),
      };

      this.calls.push(apiCall);

      // Aggregate endpoint stats
      const existing = this.endpoints.get(key);
      if (existing) {
        existing.occurrences++;
        if (!existing.statusCodes.includes(response.status())) {
          existing.statusCodes.push(response.status());
        }
      } else {
        this.endpoints.set(key, {
          method,
          pathPattern,
          occurrences: 1,
          exampleUrl: fullUrl,
          requestHeaders: Object.keys(request.headers()),
          responseTypes: [response.headers()['content-type'] || 'unknown'],
          statusCodes: [response.status()],
          domains: [urlObj.hostname],
        });
      }
    });
  }

  /**
   * Normalize URL path to a pattern (replace dynamic segments with placeholders)
   */
  private normalizePath(pathname: string): string {
    return pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
      .replace(/\/[0-9a-f]{24,}/gi, '/:id')
      .replace(/\/\d+/g, '/:num')
      .replace(/\/[a-zA-Z]{20,}/g, '/:token')
      .replace(/\/v\d+\//g, (match) => match); // Keep API version
  }

  /**
   * Get all discovered API calls
   */
  getApiCalls(): DiscoveredApi[] {
    return this.calls;
  }

  /**
   * Get aggregated endpoint summary
   */
  getEndpoints(): ApiEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * Get endpoints grouped by method
   */
  getEndpointsByMethod(): Record<string, ApiEndpoint[]> {
    const grouped: Record<string, ApiEndpoint[]> = {};
    for (const ep of this.endpoints.values()) {
      if (!grouped[ep.method]) grouped[ep.method] = [];
      grouped[ep.method].push(ep);
    }
    return grouped;
  }

  /**
   * Get all unique API base URLs (domains)
   */
  getApiDomains(): string[] {
    const domains = new Set<string>();
    for (const call of this.calls) {
      try {
        domains.add(new URL(call.url).origin);
      } catch { /* skip */ }
    }
    return Array.from(domains);
  }

  /**
   * Get API calls with errors (4xx/5xx)
   */
  getErrorCalls(): DiscoveredApi[] {
    return this.calls.filter(c => c.statusCode >= 400);
  }

  /**
   * Get API calls with slow responses (>1s)
   */
  getSlowCalls(thresholdMs: number = 1000): DiscoveredApi[] {
    return this.calls.filter(c => c.durationMs > thresholdMs);
  }

  /**
   * Clear all captured data
   */
  clear(): void {
    this.calls = [];
    this.endpoints.clear();
  }

  /**
   * Summary statistics
   */
  getStats() {
    return {
      totalCalls: this.calls.length,
      uniqueEndpoints: this.endpoints.size,
      errorRate: this.calls.length > 0
        ? ((this.getErrorCalls().length / this.calls.length) * 100).toFixed(1) + '%'
        : '0%',
      slowCalls: this.getSlowCalls().length,
      methods: Object.keys(this.getEndpointsByMethod()),
      domains: this.getApiDomains(),
    };
  }
}
