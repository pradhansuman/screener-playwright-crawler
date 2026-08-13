// url-normalizer.ts — URL canonicalization and normalization

import { CrawlConfig } from '../types';

/**
 * Normalize a URL to a canonical form:
 * - Lowercase scheme + host
 * - Remove default ports (80, 443)
 * - Remove fragment
 * - Sort query params
 * - Remove tracking params per config
 * - Remove trailing slash from path (unless root)
 * - Decode safe characters, re-encode unsafe ones
 */
export function normalizeUrl(raw: string, config: CrawlConfig): string {
  try {
    let url = raw.trim();

    // Handle protocol-relative URLs
    if (url.startsWith('//')) {
      url = 'https:' + url;
    }

    const parsed = new URL(url);

    // Lowercase scheme and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove default ports
    if (
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
    ) {
      parsed.port = '';
    }

    // Remove fragment
    parsed.hash = '';

    // Remove tracking query params
    if (config.stripQueryParams.length > 0 && parsed.search) {
      const params = new URLSearchParams(parsed.search);
      for (const strip of config.stripQueryParams) {
        params.delete(strip);
      }
      parsed.search = params.toString() ? '?' + params.toString() : '';
    }

    // Sort remaining query params alphabetically
    if (parsed.search) {
      const params = new URLSearchParams(parsed.search);
      const sorted: string[] = [];
      for (const [k, v] of Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        sorted.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
      parsed.search = sorted.length ? '?' + sorted.join('&') : '';
    }

    // Remove trailing slash (except root)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return raw;
  }
}

/**
 * Check if a URL is within allowed domains
 */
export function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  try {
    const hostname = new URL(url).hostname;
    if (allowedDomains.length === 0) return true;
    return allowedDomains.some(d =>
      hostname === d || hostname.endsWith('.' + d)
    );
  } catch {
    return false;
  }
}

/**
 * Check if URL matches any exclude pattern
 */
export function isExcluded(url: string, patterns: string[]): boolean {
  return patterns.some(p => {
    try {
      return new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(url);
    } catch {
      return url.toLowerCase().includes(p.toLowerCase());
    }
  });
}

/**
 * Check if URL has the same domain as the reference
 */
export function isSameDomain(url: string, referenceUrl: string): boolean {
  try {
    return new URL(url).hostname === new URL(referenceUrl).hostname;
  } catch {
    return false;
  }
}

/**
 * Resolve a relative URL against a base
 */
export function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/**
 * Extract the domain from a URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Check if a URL is an internal page anchor
 */
export function isInternalAnchor(href: string): boolean {
  return href.startsWith('#');
}

/**
 * Check if a URL is a valid HTTP(S) URL
 */
export function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Get path segments from URL
 */
export function getPathSegments(url: string): string[] {
  try {
    return new URL(url).pathname.split('/').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Calculate a priority score for a URL (higher = crawl sooner)
 */
export function calculatePriority(
  url: string,
  depth: number,
  discoveredFromPath: string,
): number {
  let score = 10 - depth; // shallower pages first

  const path = getPathSegments(url);

  // Prioritize pages that look like product/feature pages
  const highValuePaths = ['product', 'feature', 'pricing', 'docs', 'api', 'blog', 'help'];
  if (path.length > 0 && highValuePaths.includes(path[0].toLowerCase())) {
    score += 5;
  }

  // Prioritize shorter paths (closer to root)
  score += Math.max(0, 5 - path.length);

  // Deprioritize assets
  const assetExts = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
  if (assetExts.some(ext => url.toLowerCase().includes(ext))) {
    score -= 8;
  }

  return Math.max(0, score);
}
