// url-frontier.ts — Priority-based URL frontier (queue)

import { FrontierUrl } from '../types';

/**
 * Priority-based URL frontier.
 * Higher priority URLs are crawled first.
 * Within same priority: FIFO order.
 */
export class UrlFrontier {
  private queues = new Map<number, FrontierUrl[]>();
  private urlsInQueue = new Set<string>();
  private maxSize: number;

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Add a URL to the frontier with priority
   */
  enqueue(item: FrontierUrl): boolean {
    if (this.urlsInQueue.has(item.normalizedUrl)) {
      return false;
    }
    if (this.urlsInQueue.size >= this.maxSize) {
      return false;
    }

    const priority = Math.round(item.priority);
    if (!this.queues.has(priority)) {
      this.queues.set(priority, []);
    }

    this.queues.get(priority)!.push(item);
    this.urlsInQueue.add(item.normalizedUrl);
    return true;
  }

  /**
   * Get the next URL to crawl (highest priority first)
   */
  dequeue(): FrontierUrl | null {
    const priorities = Array.from(this.queues.keys()).sort((a, b) => b - a);

    for (const priority of priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        const item = queue.shift()!;
        this.urlsInQueue.delete(item.normalizedUrl);

        // Clean up empty queues
        if (queue.length === 0) {
          this.queues.delete(priority);
        }

        return item;
      }
    }

    return null;
  }

  /**
   * Number of URLs in the frontier
   */
  get size(): number {
    return this.urlsInQueue.size;
  }

  /**
   * Whether the frontier is empty
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Peek at next URL without removing
   */
  peek(): FrontierUrl | null {
    const priorities = Array.from(this.queues.keys()).sort((a, b) => b - a);

    for (const priority of priorities) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }

    return null;
  }

  /**
   * Get all URLs at a specific priority level
   */
  getBatch(priority: number, count: number): FrontierUrl[] {
    const queue = this.queues.get(priority);
    if (!queue) return [];
    return queue.slice(0, count);
  }

  /**
   * Get stats about the frontier
   */
  getStats() {
    const priorityDistribution: Record<string, number> = {};
    for (const [priority, queue] of this.queues) {
      priorityDistribution[`p${priority}`] = queue.length;
    }

    return {
      totalQueued: this.urlsInQueue.size,
      priorityLevels: this.queues.size,
      distribution: priorityDistribution,
    };
  }

  /**
   * Clear all URLs
   */
  clear(): void {
    this.queues.clear();
    this.urlsInQueue.clear();
  }

  /**
   * Check if URL is already queued
   */
  has(url: string): boolean {
    return this.urlsInQueue.has(url);
  }
}
