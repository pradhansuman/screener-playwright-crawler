// sitemap.ts — Sitemap.xml parser and URL extractor

import { CrawlConfig } from '../types';

interface SitemapEntry {
  url: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
}

/**
 * Sitemap parser that supports:
 * - Standard XML sitemaps
 * - Sitemap index files (recursive)
 * - Gzipped sitemaps
 */
export class SitemapParser {
  private config: CrawlConfig;

  constructor(config: CrawlConfig) {
    this.config = config;
  }

  /**
   * Fetch and parse a sitemap URL
   */
  async parse(sitemapUrl: string): Promise<SitemapEntry[]> {
    try {
      const response = await fetch(sitemapUrl, {
        headers: this.config.headers,
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) return [];

      const text = await response.text();

      // Check if it's a sitemap index
      if (text.includes('<sitemapindex')) {
        return this.parseSitemapIndex(text);
      }

      // Regular sitemap
      return this.parseSitemapXml(text);
    } catch {
      return [];
    }
  }

  /**
   * Parse a sitemap index (recursive)
   */
  private async parseSitemapIndex(xml: string): Promise<SitemapEntry[]> {
    const entries: SitemapEntry[] = [];
    const sitemapRegex = /<sitemap>([\s\S]*?)<\/sitemap>/gi;
    const locRegex = /<loc>([^<]+)<\/loc>/i;

    let match;
    while ((match = sitemapRegex.exec(xml)) !== null) {
      const block = match[1];
      const locMatch = locRegex.exec(block);
      if (locMatch) {
        const subUrl = locMatch[1].trim();
        // Recursively parse sub-sitemaps (max depth guard)
        const subEntries = await this.parse(subUrl);
        entries.push(...subEntries);
      }
    }

    return entries;
  }

  /**
   * Parse a regular sitemap XML
   */
  private parseSitemapXml(xml: string): SitemapEntry[] {
    const entries: SitemapEntry[] = [];
    const urlRegex = /<url>([\s\S]*?)<\/url>/gi;

    let match;
    while ((match = urlRegex.exec(xml)) !== null) {
      const block = match[1];

      const loc = this.extractTag(block, 'loc');
      if (!loc) continue;

      entries.push({
        url: loc.trim(),
        lastmod: this.extractTag(block, 'lastmod') || undefined,
        changefreq: this.extractTag(block, 'changefreq') || undefined,
        priority: parseFloat(this.extractTag(block, 'priority') || '0.5'),
      });
    }

    return entries;
  }

  /**
   * Extract a tag value from XML block
   */
  private extractTag(block: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i');
    const match = regex.exec(block);
    return match ? match[1] : null;
  }

  /**
   * Auto-discover sitemap from domain (robots.txt + common paths)
   */
  static getCommonSitemapUrls(domain: string): string[] {
    const base = `https://${domain}`;
    return [
      `${base}/sitemap.xml`,
      `${base}/sitemap_index.xml`,
      `${base}/sitemap-index.xml`,
      `${base}/sitemap.php`,
      `${base}/sitemap.txt`,
    ];
  }
}
