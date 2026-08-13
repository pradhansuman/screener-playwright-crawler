// deduplicator.ts — URL deduplication using Set + content hashing

import { createHash } from 'crypto';

/**
 * Simple but effective URL deduplicator.
 * Uses two strategies:
 * 1. Exact URL match via Set (fast)
 * 2. Content hash match via Map (catches different URLs returning same content)
 */
export class Deduplicator {
  private seenUrls = new Set<string>();
  private contentHashes = new Map<string, string>(); // hash -> first url
  private stats = { total: 0, duplicates: 0, contentDupes: 0 };

  /**
   * Check if a URL has been seen before
   */
  isDuplicate(normalizedUrl: string): boolean {
    const dup = this.seenUrls.has(normalizedUrl);
    if (dup) {
      this.stats.duplicates++;
    }
    this.stats.total++;
    return dup;
  }

  /**
   * Mark a URL as seen
   */
  markSeen(normalizedUrl: string): void {
    this.seenUrls.add(normalizedUrl);
  }

  /**
   * Check if content has been seen before (via hash)
   */
  isDuplicateContent(contentHash: string): boolean {
    return this.contentHashes.has(contentHash);
  }

  /**
   * Get the original URL for a content hash
   */
  getFirstUrlForContent(contentHash: string): string | undefined {
    return this.contentHashes.get(contentHash);
  }

  /**
   * Register content with its URL
   */
  registerContent(normalizedUrl: string, contentHash: string): void {
    if (!this.contentHashes.has(contentHash)) {
      this.contentHashes.set(contentHash, normalizedUrl);
    } else {
      this.stats.contentDupes++;
    }
  }

  /**
   * Hash a string content (HTML body)
   */
  static hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * Get deduplication statistics
   */
  getStats() {
    return {
      ...this.stats,
      uniqueUrls: this.seenUrls.size,
      uniqueContent: this.contentHashes.size,
      deduplicationRate: this.stats.total > 0
        ? ((this.stats.duplicates / this.stats.total) * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.seenUrls.clear();
    this.contentHashes.clear();
    this.stats = { total: 0, duplicates: 0, contentDupes: 0 };
  }
}
