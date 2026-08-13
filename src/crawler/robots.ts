// robots.ts — robots.txt parser and compliance checker

import { CrawlConfig } from '../types';

interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelay: number | null;
  sitemaps: string[];
}

/**
 * Parse and check robots.txt compliance.
 * Uses a simple parser for common directives.
 */
export class RobotsChecker {
  private rules = new Map<string, RobotsRules>(); // domain -> rules
  private config: CrawlConfig;

  constructor(config: CrawlConfig) {
    this.config = config;
  }

  /**
   * Fetch and parse robots.txt for a domain
   */
  async loadRobotsTxt(domain: string): Promise<void> {
    if (!this.config.respectRobotsTxt) return;
    if (this.rules.has(domain)) return;

    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const response = await fetch(robotsUrl, {
        headers: this.config.headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        // If robots.txt not found (404), allow all
        this.rules.set(domain, { disallow: [], allow: [], crawlDelay: null, sitemaps: [] });
        return;
      }

      const text = await response.text();
      this.rules.set(domain, this.parse(text));
    } catch {
      // On error (timeout, DNS, etc.), be conservative and allow
      this.rules.set(domain, { disallow: [], allow: [], crawlDelay: null, sitemaps: [] });
    }
  }

  /**
   * Parse robots.txt content
   */
  private parse(content: string): RobotsRules {
    const rules: RobotsRules = {
      disallow: [],
      allow: [],
      crawlDelay: null,
      sitemaps: [],
    };

    let currentUserAgent = '';
    let appliesToUs = false;

    for (const line of content.split('\n')) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') continue;

      const [directive, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();

      if (!directive || !value) continue;

      const d = directive.toLowerCase().trim();

      if (d === 'user-agent') {
        currentUserAgent = value.toLowerCase();
        appliesToUs = currentUserAgent === '*' ||
          currentUserAgent.includes('screener') ||
          currentUserAgent.includes('playwright');
        continue;
      }

      if (!appliesToUs) continue;

      switch (d) {
        case 'disallow':
          if (value) rules.disallow.push(value);
          break;
        case 'allow':
          if (value) rules.allow.push(value);
          break;
        case 'crawl-delay':
          const delay = parseFloat(value);
          if (!isNaN(delay) && delay > 0) {
            rules.crawlDelay = delay;
          }
          break;
        case 'sitemap':
          rules.sitemaps.push(value);
          break;
      }
    }

    return rules;
  }

  /**
   * Check if a URL path is allowed by robots.txt
   */
  isAllowed(domain: string, path: string): boolean {
    if (!this.config.respectRobotsTxt) return true;

    const rules = this.rules.get(domain);
    if (!rules) {
      // Rules not loaded yet — allow (conservative for first crawl)
      return true;
    }

    // Check allow rules first (they override disallow)
    for (const allow of rules.allow) {
      if (this.pathMatches(path, allow)) {
        return true;
      }
    }

    // Check disallow rules
    for (const disallow of rules.disallow) {
      if (this.pathMatches(path, disallow)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get crawl delay for a domain (in seconds)
   */
  getCrawlDelay(domain: string): number {
    const rules = this.rules.get(domain);
    if (rules?.crawlDelay !== null) {
      return rules.crawlDelay * 1000; // Convert to ms
    }
    return this.config.requestDelayMs;
  }

  /**
   * Get discovered sitemap URLs
   */
  getSitemaps(domain: string): string[] {
    return this.rules.get(domain)?.sitemaps ?? [];
  }

  /**
   * Simple glob-style path matching for robots.txt
   */
  private pathMatches(path: string, pattern: string): boolean {
    // Convert robots.txt pattern to regex
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      .replace(/\\\*/g, '.*');                  // * -> .*

    const regex = new RegExp('^' + escaped);
    return regex.test(path);
  }
}
