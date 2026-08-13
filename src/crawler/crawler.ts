// crawler.ts — Main Playwright-based crawler orchestrator

import { Browser, BrowserContext, chromium, Page } from 'playwright';
import { CrawlConfig, CrawledPage, FrontierUrl, CrawlReport } from '../types';
import { loadConfig } from '../config';
import { UrlFrontier } from './url-frontier';
import { Deduplicator } from './deduplicator';
import { normalizeUrl, isDomainAllowed, isExcluded, resolveUrl, extractDomain, calculatePriority, isValidHttpUrl, isInternalAnchor } from './url-normalizer';
import { RobotsChecker } from './robots';
import { SitemapParser } from './sitemap';

export class Crawler {
  private config: CrawlConfig;
  private frontier: UrlFrontier;
  private deduplicator: Deduplicator;
  private robotsChecker: RobotsChecker;
  private sitemapParser: SitemapParser;
  private crawledPages: CrawledPage[] = [];
  private errors: { url: string; error: string; timestamp: Date }[] = [];
  private sitemapEntries: string[] = [];
  private startTime = 0;
  private browser: Browser | null = null;
  private contextPool: BrowserContext[] = [];

  constructor(configOverrides?: Partial<CrawlConfig>) {
    this.config = loadConfig(configOverrides);
    this.frontier = new UrlFrontier(this.config.maxPages * 2);
    this.deduplicator = new Deduplicator();
    this.robotsChecker = new RobotsChecker(this.config);
    this.sitemapParser = new SitemapParser(this.config);
  }

  /**
   * Run the full crawl pipeline
   */
  async crawl(): Promise<CrawlReport> {
    this.startTime = Date.now();

    try {
      // 1. Launch browser
      this.browser = await chromium.launch({ headless: true });

      // 2. Seed the frontier from sitemaps and seed URLs
      await this.seedFrontier();

      // 3. Create browser context pool
      for (let i = 0; i < this.config.concurrency; i++) {
        const ctx = await this.browser.newContext({
          viewport: this.config.viewport,
          userAgent: this.config.headers['User-Agent'] as string,
          extraHTTPHeaders: this.config.headers as Record<string, string>,
        });
        this.contextPool.push(ctx);
      }

      // 4. Crawl loop
      let activePages = 0;
      const maxConcurrent = this.config.concurrency;

      while (!this.frontier.isEmpty && this.crawledPages.length < this.config.maxPages) {
        const batch: Promise<void>[] = [];

        while (activePages < maxConcurrent && !this.frontier.isEmpty) {
          const next = this.frontier.dequeue();
          if (!next) break;

          activePages++;
          const ctx = this.contextPool[activePages % this.contextPool.length];
          batch.push(this.crawlPage(next, ctx).finally(() => { activePages--; }));
        }

        if (batch.length === 0) break;
        await Promise.all(batch);
      }
    } finally {
      // Cleanup
      for (const ctx of this.contextPool) {
        await ctx.close().catch(() => {});
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
      }
    }

    return this.buildReport();
  }

  /**
   * Seed the frontier with starting URLs and sitemap entries
   */
  private async seedFrontier(): Promise<void> {
    const domains = new Set<string>();

    for (const seedUrl of this.config.seedUrls) {
      const norm = normalizeUrl(seedUrl, this.config);
      domains.add(extractDomain(norm));

      const item: FrontierUrl = {
        url: seedUrl,
        normalizedUrl: norm,
        depth: 0,
        priority: 15,
        discoveredFrom: 'seed',
        discoveredAt: new Date(),
        metadata: {},
      };

      if (this.frontier.enqueue(item)) {
        this.deduplicator.markSeen(norm);
      }
    }

    // Load robots.txt for each domain and fetch sitemaps
    for (const domain of domains) {
      await this.robotsChecker.loadRobotsTxt(domain);

      // Try common sitemap URLs
      for (const sitemapUrl of SitemapParser.getCommonSitemapUrls(domain)) {
        const entries = await this.sitemapParser.parse(sitemapUrl);
        for (const entry of entries) {
          this.sitemapEntries.push(entry.url);
          const norm = normalizeUrl(entry.url, this.config);

          if (!this.deduplicator.isDuplicate(norm)) {
            const item: FrontierUrl = {
              url: entry.url,
              normalizedUrl: norm,
              depth: 1,
              priority: entry.priority ? Math.round(entry.priority * 10) : 5,
              discoveredFrom: sitemapUrl,
              discoveredAt: new Date(),
              metadata: { lastmod: entry.lastmod, changefreq: entry.changefreq },
            };

            if (this.frontier.enqueue(item)) {
              this.deduplicator.markSeen(norm);
            }
          }
        }
      }
    }
  }

  /**
   * Crawl a single page using Playwright
   */
  private async crawlPage(item: FrontierUrl, context: BrowserContext): Promise<void> {
    const startTime = Date.now();
    let page: Page | null = null;

    try {
      // Check robots.txt
      const domain = extractDomain(item.url);
      const path = new URL(item.url).pathname;
      if (!this.robotsChecker.isAllowed(domain, path)) {
        return; // Skip disallowed pages
      }

      // Delay between requests
      const delay = this.robotsChecker.getCrawlDelay(domain);
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }

      page = await context.newPage();

      // Navigate to page
      const response = await page.goto(item.url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.pageTimeoutMs,
      });

      const statusCode = response?.status() ?? 0;
      const contentType = response?.headers()['content-type'] ?? '';

      // Skip non-HTML pages
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        await page.close();
        return;
      }

      // Wait a bit for JS to settle
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      // Extract page data
      const title = await page.title();
      const html = await page.content();
      const contentHash = Deduplicator.hashContent(html);

      // Check for duplicate content
      if (this.deduplicator.isDuplicateContent(contentHash)) {
        const firstUrl = this.deduplicator.getFirstUrlForContent(contentHash);
        await page.close();
        return;
      }
      this.deduplicator.registerContent(item.normalizedUrl, contentHash);

      // Extract links
      const links = await page.$$eval('a[href]', els =>
        els.map(el => el.getAttribute('href')).filter(Boolean) as string[]
      );

      // Extract meta tags
      const metaTags = await page.$$eval('meta[name], meta[property]', els => {
        const tags: Record<string, string> = {};
        for (const el of els) {
          const name = el.getAttribute('name') || el.getAttribute('property');
          const content = el.getAttribute('content');
          if (name && content) tags[name] = content;
        }
        return tags;
      });

      // DOM stats
      const domStats = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        const interactive = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
        const headings = {
          h1: document.querySelectorAll('h1').length,
          h2: document.querySelectorAll('h2').length,
          h3: document.querySelectorAll('h3').length,
          h4: document.querySelectorAll('h4').length,
          h5: document.querySelectorAll('h5').length,
          h6: document.querySelectorAll('h6').length,
        };
        return {
          totalElements: all.length,
          interactiveElements: interactive.length,
          forms: document.querySelectorAll('form').length,
          links: document.querySelectorAll('a[href]').length,
          images: document.querySelectorAll('img').length,
          headings,
          scripts: document.querySelectorAll('script').length,
          stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
        };
      });

      // Build crawled page result
      const crawledPage: CrawledPage = {
        url: item.url,
        normalizedUrl: item.normalizedUrl,
        title,
        statusCode,
        contentType,
        depth: item.depth,
        crawledAt: new Date(),
        durationMs: Date.now() - startTime,
        contentHash,
        links,
        metaTags,
        domStats,
      };

      this.crawledPages.push(crawledPage);

      // Enqueue new links
      if (item.depth < this.config.maxDepth) {
        for (const href of links) {
          this.enqueueDiscoveredLink(href, item.normalizedUrl, item.depth + 1);
        }
      }

      await page.close();
    } catch (err: any) {
      this.errors.push({
        url: item.url,
        error: err.message || String(err),
        timestamp: new Date(),
      });
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * Enqueue a discovered link
   */
  private enqueueDiscoveredLink(href: string, fromUrl: string, depth: number): void {
    if (isInternalAnchor(href)) return;

    const resolved = resolveUrl(href, fromUrl);
    if (!isValidHttpUrl(resolved)) return;
    if (!isDomainAllowed(resolved, this.config.allowedDomains)) return;
    if (isExcluded(resolved, this.config.excludePatterns)) return;

    const norm = normalizeUrl(resolved, this.config);
    if (this.deduplicator.isDuplicate(norm)) return;

    const priority = calculatePriority(norm, depth, fromUrl);
    const item: FrontierUrl = {
      url: resolved,
      normalizedUrl: norm,
      depth,
      priority,
      discoveredFrom: fromUrl,
      discoveredAt: new Date(),
      metadata: {},
    };

    if (this.frontier.enqueue(item)) {
      this.deduplicator.markSeen(norm);
    }
  }

  /**
   * Build the final crawl report
   */
  private buildReport(): CrawlReport {
    const loadTimes = this.crawledPages.map(p => p.durationMs);
    return {
      generatedAt: new Date(),
      config: this.config,
      stats: {
        totalDiscovered: this.deduplicator.getStats().total,
        totalCrawled: this.crawledPages.length,
        totalSkipped: this.deduplicator.getStats().duplicates,
        totalErrors: this.errors.length,
        crawlDurationMs: Date.now() - this.startTime,
        avgPageLoadMs: loadTimes.length > 0
          ? Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length)
          : 0,
      },
      pages: this.crawledPages,
      errors: this.errors,
      sitemapEntries: this.sitemapEntries,
    };
  }

  /**
   * Get the current crawl results (for progress reporting)
   */
  getProgress() {
    return {
      crawled: this.crawledPages.length,
      queued: this.frontier.size,
      errors: this.errors.length,
      elapsedMs: Date.now() - this.startTime,
    };
  }
}
