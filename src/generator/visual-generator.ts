// visual-generator.ts — Generate visual regression and responsive design tests

import { PageAnalysis, GeneratedTest, VisualElement } from '../types';

/**
 * Generates visual tests:
 * - Viewport/responsive breakpoints
 * - Element visibility and overlap
 * - Font rendering
 * - Image loading
 * - Layout integrity
 */
export class VisualGenerator {
  private breakpoints = [
    { name: 'mobile', width: 375, height: 812 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'wide', width: 1920, height: 1080 },
  ];

  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // 1. Responsive viewport tests
    tests.push(...this.generateViewportTests(analysis));

    // 2. Visual element tests
    tests.push(...this.generateElementVisualTests(analysis));

    // 3. Layout integrity tests
    tests.push(...this.generateLayoutTests(analysis));

    // 4. Screenshot comparison
    tests.push(this.generateScreenshotTest(analysis));

    return tests;
  }

  private generateViewportTests(analysis: PageAnalysis): GeneratedTest[] {
    return this.breakpoints.map(bp => ({
      id: `visual-viewport-${bp.name}-${this.slugify(analysis.pageUrl)}`,
      name: `Responsive layout: ${bp.name} (${bp.width}×${bp.height})`,
      category: 'visual' as const,
      description: `Verify page renders correctly at ${bp.name} viewport`,
      steps: [
        {
          order: 1,
          action: 'goto' as const,
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: `Page loaded at ${bp.name} viewport` },
          timeoutMs: 30000,
        },
        {
          order: 2,
          action: 'evaluate' as const,
          value: `window.innerWidth === ${bp.width} && window.innerHeight === ${bp.height}`,
          assertion: {
            type: 'text',
            expected: 'true',
            description: `Viewport is ${bp.width}×${bp.height}`,
          },
          timeoutMs: 3000,
        },
        {
          order: 3,
          action: 'screenshot' as const,
          assertion: {
            type: 'visible',
            description: `Screenshot captured: ${bp.name}`,
          },
          timeoutMs: 5000,
        },
        {
          order: 4,
          action: 'evaluate' as const,
          value: `(() => {
            const body = document.body;
            const html = document.documentElement;
            const hasHorizontalScroll = html.scrollWidth > html.clientWidth;
            const hasOverflow = body.scrollWidth > body.clientWidth;
            return !hasHorizontalScroll && !hasOverflow;
          })()`,
          assertion: {
            type: 'text',
            expected: 'true',
            description: 'No horizontal scrollbar',
          },
          timeoutMs: 3000,
        },
        {
          order: 5,
          action: 'scrollIntoView' as const,
          target: 'footer, body > *:last-child',
          assertion: {
            type: 'visible',
            description: 'Footer/last element reachable',
          },
          timeoutMs: 5000,
        },
      ],
      expectedResults: [
        `Page renders without horizontal scroll at ${bp.width}px`,
        'All content is accessible without zooming',
        'Navigation is usable (no hidden menus)',
        'Text is readable at this width',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['visual', 'responsive', bp.name],
    }));
  }

  private generateElementVisualTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Check key visual elements
    const keyVisuals = analysis.visualElements.slice(0, 15);

    if (keyVisuals.length === 0) return tests;

    tests.push({
      id: `visual-elements-${this.slugify(analysis.pageUrl)}`,
      name: `Visual element rendering (${keyVisuals.length} elements)`,
      category: 'visual',
      description: 'Verify key visual elements render correctly',
      steps: keyVisuals.map((el, i) => ({
        order: i + 1,
        action: 'evaluate' as const,
        target: el.selector,
        value: `(() => {
          const el = document.querySelector('${el.selector.replace(/'/g, "\\'")}');
          if (!el) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })()`,
        assertion: {
          type: 'text',
          expected: 'true',
          description: `Element "${el.tagName}" has positive dimensions`,
        },
        timeoutMs: 3000,
      })),
      expectedResults: [
        'All key visual elements have non-zero dimensions',
        'Elements are not overlapping in unintended ways',
        'No clipped or truncated content',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'medium',
      tags: ['visual', 'layout', 'elements'],
    });

    return tests;
  }

  private generateLayoutTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Check for common layout issues
    tests.push({
      id: `visual-layout-${this.slugify(analysis.pageUrl)}`,
      name: 'Layout integrity check',
      category: 'visual',
      description: 'Verify no overlapping, clipping, or overflow issues',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: 'Page loaded for layout check' },
          timeoutMs: 30000,
        },
        {
          order: 2,
          action: 'evaluate',
          value: `(() => {
            const body = document.body;
            const hasOverflowX = body.scrollWidth > body.clientWidth;
            const fixedElements = document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]');
            const visibleFixed = Array.from(fixedElements).filter(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden';
            });
            return { hasOverflowX, fixedCount: visibleFixed.length };
          })()`,
          assertion: {
            type: 'visible',
            description: 'Layout structure analyzed',
          },
          timeoutMs: 5000,
        },
        {
          order: 3,
          action: 'evaluate',
          value: `(() => {
            const sections = document.querySelectorAll('nav, header, main, footer, section, aside, [role="main"]');
            let overlaps = 0;
            for (let i = 0; i < sections.length; i++) {
              const a = sections[i].getBoundingClientRect();
              for (let j = i + 1; j < sections.length; j++) {
                const b = sections[j].getBoundingClientRect();
                if (a.width === 0 || a.height === 0 || b.width === 0 || b.height === 0) continue;
                const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
                if (overlap) overlaps++;
              }
            }
            return overlaps;
          })()`,
          assertion: {
            type: 'text',
            expected: '0',
            description: 'No major layout sections overlap',
          },
          timeoutMs: 5000,
        },
      ],
      expectedResults: [
        'No horizontal overflow',
        'Fixed elements do not overlap content',
        'Sections are properly separated',
        'Content does not overflow its containers',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'medium',
      tags: ['visual', 'layout', 'overflow'],
    });

    return tests;
  }

  private generateScreenshotTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `visual-fullpage-${this.slugify(analysis.pageUrl)}`,
      name: 'Full-page screenshot comparison',
      category: 'visual',
      description: 'Capture full-page screenshot for visual regression baseline',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: 'Page loaded' },
          timeoutMs: 30000,
        },
        {
          order: 2,
          action: 'screenshot',
          assertion: {
            type: 'visible',
            description: 'Full-page screenshot captured as baseline',
          },
          timeoutMs: 10000,
        },
      ],
      expectedResults: [
        'Full-page screenshot captured successfully',
        'No visual anomalies (blank areas, broken images)',
        'Can be used for future visual diff comparisons',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'medium',
      tags: ['visual', 'screenshot', 'regression'],
    };
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  }
}
