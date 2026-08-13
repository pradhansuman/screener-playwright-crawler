// config.ts — Default configuration and config loading

import { CrawlConfig } from './types';

export const DEFAULT_CRAWL_CONFIG: CrawlConfig = {
  seedUrls: [],
  maxDepth: 3,
  maxPages: 100,
  allowedDomains: [],
  excludePatterns: [
    '/logout',
    '/cdn-cgi/',
    '/wp-admin',
    'mailto:',
    'tel:',
    'javascript:',
    '#',
  ],
  respectRobotsTxt: true,
  requestDelayMs: 500,
  concurrency: 2,
  stripQueryParams: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'ref'],
  headers: {
    'User-Agent': 'ScreenerBot/2.0 (+https://screener.in/bot)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  },
  viewport: { width: 1440, height: 900 },
  pageTimeoutMs: 10000,
};

export function loadConfig(overrides?: Partial<CrawlConfig>): CrawlConfig {
  const envSeed = process.env.SEED_URLS;
  const envMax = process.env.MAX_PAGES;
  const config = { ...DEFAULT_CRAWL_CONFIG };

  if (envSeed) {
    config.seedUrls = envSeed.split(',').map(s => s.trim());
  }
  if (envMax) {
    config.maxPages = parseInt(envMax, 10);
  }

  if (overrides) {
    return { ...config, ...overrides };
  }

  return config;
}
