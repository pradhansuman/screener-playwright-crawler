// functional-generator.ts — Generate happy-path functional tests

import { PageAnalysis, GeneratedTest, DiscoveredForm, InteractiveElement, DiscoveredWorkflow } from '../types';

/**
 * Generates functional (happy-path) Playwright test scripts
 * from page analysis data.
 */
export class FunctionalGenerator {
  /**
   * Generate functional tests from page analysis
   */
  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // 1. Page load test
    tests.push(this.generatePageLoadTest(analysis));

    // 2. Form submission tests
    for (const form of analysis.forms) {
      tests.push(...this.generateFormTests(form, analysis));
    }

    // 3. Workflow tests
    for (const workflow of analysis.workflows) {
      tests.push(this.generateWorkflowTest(workflow, analysis));
    }

    // 4. Key interaction tests
    tests.push(...this.generateInteractionTests(analysis));

    // 5. Navigation tests
    tests.push(...this.generateNavigationTests(analysis));

    return tests;
  }

  private generatePageLoadTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `func-page-load-${this.slugify(analysis.pageUrl)}`,
      name: `Page loads successfully: ${analysis.title}`,
      category: 'functional',
      description: `Verify ${analysis.pageUrl} loads with correct title and content`,
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: { type: 'title', expected: analysis.title, description: 'Page title matches' },
          timeoutMs: 30000,
        },
        {
          order: 2,
          action: 'waitForSelector',
          target: 'body',
          assertion: { type: 'visible', target: 'body', description: 'Body is visible' },
          timeoutMs: 5000,
        },
      ],
      expectedResults: [
        'Page loads without errors',
        `Title contains "${analysis.title}"`,
        'No console errors',
        'Content is visible',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['smoke', 'page-load'],
    };
  }

  private generateFormTests(form: DiscoveredForm, analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    if (form.fields.length === 0) return tests;

    // Happy-path form submission
    const steps = form.fields.map((field, i) => ({
      order: i + 1,
      action: (field.type === 'select' ? 'selectOption' :
               field.type === 'checkbox' ? 'check' :
               field.type === 'radio' ? 'click' : 'fill') as any,
      target: field.selector,
      value: this.getHappyPathValue(field),
      assertion: { type: 'visible', target: field.selector, description: `Field ${field.name || i} is fillable` },
      timeoutMs: 5000,
    }));

    if (form.submitButton) {
      steps.push({
        order: steps.length + 1,
        action: 'click',
        target: form.submitButton.selector,
        assertion: { type: 'visible', description: 'Form submits successfully' },
        timeoutMs: 10000,
      });
    }

    tests.push({
      id: `func-form-${this.slugify(form.selector)}`,
      name: `Submit form: ${form.selector}`,
      category: 'functional',
      description: `Fill and submit form ${form.selector} with valid data`,
      steps,
      expectedResults: [
        'All fields accept valid input',
        'Form submits without validation errors',
        'Success response or redirect',
      ],
      sourcePage: analysis.pageUrl,
      sourceElement: form.selector,
      priority: 'critical',
      tags: ['smoke', 'form', 'submission'],
    });

    return tests;
  }

  private generateWorkflowTest(workflow: DiscoveredWorkflow, analysis: PageAnalysis): GeneratedTest {
    return {
      id: `func-${this.slugify(workflow.id)}`,
      name: workflow.name,
      category: 'functional',
      description: workflow.description,
      steps: workflow.steps.map(step => ({
        order: step.order,
        action: this.mapAction(step.action),
        target: step.targetSelector,
        value: step.value,
        assertion: { type: 'visible', description: step.description },
        timeoutMs: 10000,
      })),
      expectedResults: [
        'All steps execute without errors',
        'Correct pages load at each step',
        'Final state is as expected',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['workflow', 'e2e'],
    };
  }

  private generateInteractionTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const keyElements = analysis.interactiveElements
      .filter(e => e.isVisible && e.isEnabled)
      .slice(0, 20); // Limit to top 20

    // Group by type
    const buttons = keyElements.filter(e => e.elementType === 'button');
    const links = keyElements.filter(e => e.elementType === 'link');

    if (buttons.length > 0) {
      tests.push({
        id: `func-buttons-${this.slugify(analysis.pageUrl)}`,
        name: 'All buttons are clickable',
        category: 'functional',
        description: `Verify ${buttons.length} buttons are interactive`,
        steps: buttons.map((btn, i) => ({
          order: i + 1,
          action: 'click' as const,
          target: btn.selector,
          assertion: { type: 'visible', description: `Button "${btn.text}" responds to click` },
          timeoutMs: 5000,
        })),
        expectedResults: ['All buttons respond to clicks', 'No unexpected errors'],
        sourcePage: analysis.pageUrl,
        priority: 'high',
        tags: ['interaction', 'buttons'],
      });
    }

    if (links.length > 0) {
      tests.push({
        id: `func-links-${this.slugify(analysis.pageUrl)}`,
        name: 'Key links are navigable',
        category: 'functional',
        description: `Verify ${links.length} links lead to valid destinations`,
        steps: links.slice(0, 10).map((link, i) => ({
          order: i + 1,
          action: 'click' as const,
          target: link.selector,
          assertion: link.attributes.href?.startsWith('http')
            ? { type: 'url', expected: link.attributes.href, description: `Navigates to ${link.attributes.href}` }
            : { type: 'visible', description: `Link "${link.text}" is clickable` },
          timeoutMs: 10000,
        })),
        expectedResults: ['All links navigate to correct destinations'],
        sourcePage: analysis.pageUrl,
        priority: 'high',
        tags: ['navigation', 'links'],
      });
    }

    return tests;
  }

  private generateNavigationTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Test key interactive elements
    const navElements = analysis.interactiveElements
      .filter(e => e.isVisible && e.isEnabled &&
        (e.elementType === 'nav-link' || e.elementType === 'tab' || e.elementType === 'accordion'))
      .slice(0, 10);

    if (navElements.length === 0) return tests;

    tests.push({
      id: `func-navigation-${this.slugify(analysis.pageUrl)}`,
      name: 'Navigation elements are functional',
      category: 'functional',
      description: `Test ${navElements.length} navigation elements`,
      steps: navElements.map((el, i) => ({
        order: i + 1,
        action: 'click' as const,
        target: el.selector,
        assertion: { type: 'visible', description: `Navigation element "${el.text}" works` },
        timeoutMs: 5000,
      })),
      expectedResults: ['All navigation elements respond to interaction'],
      sourcePage: analysis.pageUrl,
      priority: 'medium',
      tags: ['navigation', 'ui'],
    });

    return tests;
  }

  private getHappyPathValue(field: any): string {
    const label = ((field.label || '') + (field.name || '')).toLowerCase();

    if (field.type === 'email') return 'test@example.com';
    if (field.type === 'password') return 'SecureP@ssw0rd1!';
    if (field.type === 'number') {
      if (field.min && field.max) return String((+field.min + +field.max) / 2);
      return '50';
    }
    if (field.type === 'tel' || label.includes('phone')) return '+15551234567';
    if (field.type === 'url') return 'https://example.com';
    if (field.type === 'date') return '2026-08-15';
    if (field.options?.length > 0) return field.options[0].value;
    if (label.includes('name')) return 'John Doe';
    if (label.includes('city')) return 'San Francisco';
    if (label.includes('address')) return '123 Main St';

    return 'Test Input';
  }

  private mapAction(action: string): any {
    const map: Record<string, any> = {
      navigate: 'goto',
      click: 'click',
      type: 'fill',
      select: 'selectOption',
      submit: 'click',
      wait: 'waitForSelector',
    };
    return map[action] || action;
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60).toLowerCase();
  }
}
