// accessibility-generator.ts — Generate WCAG accessibility tests

import { PageAnalysis, GeneratedTest, AccessibilityIssue } from '../types';

/**
 * Generates accessibility tests based on WCAG guidelines:
 * - Keyboard navigation
 * - ARIA attributes
 * - Color contrast
 * - Screen reader compatibility
 * - Focus management
 */
export class AccessibilityGenerator {
  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // 1. Keyboard navigation test
    tests.push(this.generateKeyboardNavigationTest(analysis));

    // 2. ARIA attributes test
    tests.push(this.generateAriaTest(analysis));

    // 3. Image alt text test
    tests.push(this.generateImageAltTest(analysis));

    // 4. Heading structure test
    tests.push(this.generateHeadingTest(analysis));

    // 5. Specific issue-based tests
    for (const issue of analysis.accessibilityIssues) {
      tests.push(this.generateIssueTest(issue, analysis));
    }

    // 6. Focus management test
    tests.push(this.generateFocusTest(analysis));

    // 7. Form label test
    tests.push(this.generateFormLabelTest(analysis));

    return tests;
  }

  private generateKeyboardNavigationTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `a11y-keyboard-${this.slugify(analysis.pageUrl)}`,
      name: 'Keyboard navigation accessibility',
      category: 'accessibility',
      description: 'Verify all interactive elements are reachable via keyboard (Tab/Shift+Tab)',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: 'Page loaded' },
          timeoutMs: 15000,
        },
        {
          order: 2,
          action: 'pressKey',
          target: 'body',
          value: 'Tab',
          assertion: {
            type: 'focused',
            description: 'First focusable element receives focus',
          },
          timeoutMs: 2000,
        },
        {
          order: 3,
          action: 'pressKey',
          target: 'body',
          value: 'Tab',
          assertion: {
            type: 'visible',
            description: 'Focus moves forward to next element',
          },
          timeoutMs: 2000,
        },
        {
          order: 4,
          action: 'pressKey',
          value: 'Enter',
          assertion: {
            type: 'visible',
            description: 'Focused element activates on Enter',
          },
          timeoutMs: 5000,
        },
        {
          order: 5,
          action: 'pressKey',
          value: 'Escape',
          assertion: {
            type: 'visible',
            description: 'Escape dismisses overlays/menus',
          },
          timeoutMs: 2000,
        },
      ],
      expectedResults: [
        'All interactive elements are keyboard-reachable',
        'Focus indicator is visible',
        'Tab order follows logical reading order',
        'Enter/Space activates focused elements',
        'Escape closes modals/dropdowns',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['accessibility', 'keyboard', 'wcag-2.1'],
    };
  }

  private generateAriaTest(analysis: PageAnalysis): GeneratedTest {
    const ariaElements = analysis.interactiveElements.filter(e =>
      e.aria.role || e.aria.label || e.aria.hasPopup
    );

    return {
      id: `a11y-aria-${this.slugify(analysis.pageUrl)}`,
      name: `ARIA attribute verification (${ariaElements.length} elements)`,
      category: 'accessibility',
      description: 'Verify ARIA roles, labels, and states are correct',
      steps: ariaElements.slice(0, 15).map((el, i) => ({
        order: i + 1,
        action: 'evaluate',
        target: el.selector,
        value: JSON.stringify({
          role: el.aria.role,
          label: el.aria.label,
          hasPopup: el.aria.hasPopup,
        }),
        assertion: {
          type: 'aria',
          target: el.selector,
          description: `ARIA check: ${el.selector}`,
        },
        timeoutMs: 3000,
      })),
      expectedResults: [
        'ARIA roles are valid and appropriate',
        'ARIA labels are descriptive',
        'ARIA states reflect current UI state',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['accessibility', 'aria', 'wcag-4.1'],
    };
  }

  private generateImageAltTest(analysis: PageAnalysis): GeneratedTest {
    const imageCount = analysis.domStats.images;

    return {
      id: `a11y-images-${this.slugify(analysis.pageUrl)}`,
      name: `Image alt text check (${imageCount} images)`,
      category: 'accessibility',
      description: 'Verify all images have appropriate alt text',
      steps: [{
        order: 1,
        action: 'goto',
        target: analysis.pageUrl,
        assertion: { type: 'visible', description: 'Page loaded' },
        timeoutMs: 15000,
      }, {
        order: 2,
        action: 'evaluate',
        value: `Array.from(document.querySelectorAll('img')).filter(i => !i.alt).length`,
        assertion: {
          type: 'text',
          expected: '0',
          description: 'All images have alt attributes',
        },
        timeoutMs: 5000,
      }, {
        order: 3,
        action: 'evaluate',
        value: `Array.from(document.querySelectorAll('img[alt=""]')).length`,
        assertion: {
          type: 'text',
          description: 'Decorative images use empty alt=""',
        },
        timeoutMs: 5000,
      }],
      expectedResults: [
        'All <img> elements have alt attribute',
        'Informational images have descriptive alt text',
        'Decorative images use alt=""',
        'No images with filename as alt text',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['accessibility', 'images', 'wcag-1.1'],
    };
  }

  private generateHeadingTest(analysis: PageAnalysis): GeneratedTest {
    const h = analysis.domStats.headings;

    return {
      id: `a11y-headings-${this.slugify(analysis.pageUrl)}`,
      name: `Heading structure (H1:${h.h1} H2:${h.h2} H3:${h.h3})`,
      category: 'accessibility',
      description: 'Verify heading hierarchy follows WCAG guidelines',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: 'Page loaded' },
          timeoutMs: 15000,
        },
        {
          order: 2,
          action: 'evaluate',
          value: 'document.querySelectorAll("h1").length',
          assertion: {
            type: 'text',
            expected: '1',
            description: 'Page has exactly one H1',
          },
          timeoutMs: 3000,
        },
        {
          order: 3,
          action: 'evaluate',
          value: `(() => {
            const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
            let prev = 0;
            for (const h of headings) {
              const lvl = parseInt(h.tagName[1]);
              if (prev > 0 && lvl > prev + 1) return false;
              prev = lvl;
            }
            return true;
          })()`,
          assertion: {
            type: 'text',
            expected: 'true',
            description: 'No heading levels skipped',
          },
          timeoutMs: 3000,
        },
      ],
      expectedResults: [
        'One H1 per page',
        'Headings are sequential (no skipped levels)',
        'Headings accurately describe content structure',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['accessibility', 'headings', 'wcag-1.3'],
    };
  }

  private generateIssueTest(issue: AccessibilityIssue, analysis: PageAnalysis): GeneratedTest {
    return {
      id: `a11y-issue-${this.slugify(issue.rule)}`,
      name: `Fix: ${issue.description}`,
      category: 'accessibility',
      description: `${issue.description} (${issue.wcag})`,
      steps: [{
        order: 1,
        action: 'evaluate',
        target: issue.selector,
        assertion: {
          type: 'accessible',
          target: issue.selector,
          description: issue.suggestion,
        },
        timeoutMs: 5000,
      }],
      expectedResults: [issue.suggestion],
      sourcePage: analysis.pageUrl,
      sourceElement: issue.selector,
      priority: issue.impact === 'critical' ? 'critical' :
                issue.impact === 'serious' ? 'high' :
                issue.impact === 'moderate' ? 'medium' : 'low',
      tags: ['accessibility', issue.rule, issue.wcag],
    };
  }

  private generateFocusTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `a11y-focus-${this.slugify(analysis.pageUrl)}`,
      name: 'Focus management and visibility',
      category: 'accessibility',
      description: 'Verify focus indicators are visible and focus trap works',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'visible', description: 'Page loaded' },
          timeoutMs: 15000,
        },
        {
          order: 2,
          action: 'evaluate',
          value: `(() => {
            const style = getComputedStyle(document.body);
            return !style.outline.includes('none') || document.querySelector('[data-focus-visible]');
          })()`,
          assertion: {
            type: 'text',
            expected: 'true',
            description: 'Focus indicator is visible',
          },
          timeoutMs: 3000,
        },
      ],
      expectedResults: [
        'Focus outline is visible on interactive elements',
        'No focus traps (keyboard can escape)',
        'Skip navigation link available',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['accessibility', 'focus', 'wcag-2.4'],
    };
  }

  private generateFormLabelTest(analysis: PageAnalysis): GeneratedTest {
    const inputCount = analysis.interactiveElements.filter(e =>
      ['input', 'select', 'textarea'].includes(e.elementType)
    ).length;

    return {
      id: `a11y-labels-${this.slugify(analysis.pageUrl)}`,
      name: `Form input labels (${inputCount} inputs)`,
      category: 'accessibility',
      description: 'Verify all form inputs have associated labels',
      steps: [{
        order: 1,
        action: 'goto',
        target: analysis.pageUrl,
        assertion: { type: 'visible', description: 'Page loaded' },
        timeoutMs: 15000,
      }, {
        order: 2,
        action: 'evaluate',
        value: `Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
          .filter(el => {
            if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
            if (el.id && document.querySelector(\`label[for="\${CSS.escape(el.id)}"]\`)) return false;
            if (el.closest('label')) return false;
            return true;
          }).length`,
        assertion: {
          type: 'text',
          expected: '0',
          description: 'All inputs have accessible labels',
        },
        timeoutMs: 5000,
      }],
      expectedResults: [
        'Every form input has a label (explicit or implicit)',
        'Labels are descriptive and unique where appropriate',
        'Placeholder text is not used as sole label',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['accessibility', 'labels', 'wcag-1.3'],
    };
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  }
}
