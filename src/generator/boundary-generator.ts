// boundary-generator.ts — Generate boundary/edge-case tests

import { PageAnalysis, GeneratedTest, DiscoveredForm, FormField } from '../types';

/**
 * Generates boundary test scenarios:
 * - Min/max length edge cases
 * - Numeric boundaries
 * - Empty and overflow states
 * - Special characters and Unicode
 * - Pagination boundaries
 */
export class BoundaryGenerator {
  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Form field boundary tests
    for (const form of analysis.forms) {
      tests.push(...this.generateFieldBoundaryTests(form, analysis));
    }

    // Page content boundary tests
    tests.push(...this.generateContentBoundaryTests(analysis));

    return tests;
  }

  private generateFieldBoundaryTests(form: DiscoveredForm, analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // MaxLength boundary tests
    for (const field of form.fields) {
      if (field.maxLength && field.maxLength > 0) {
        tests.push({
          id: `bound-maxlen-${this.slugify(field.selector)}`,
          name: `Max length boundary: ${field.label || field.name} (max ${field.maxLength})`,
          category: 'boundary',
          description: `Test input at and beyond max length of ${field.maxLength}`,
          steps: [
            {
              order: 1,
              action: 'fill',
              target: field.selector,
              value: 'x'.repeat(field.maxLength),
              assertion: {
                type: 'value',
                expected: 'x'.repeat(field.maxLength),
                description: `Exactly ${field.maxLength} characters accepted`,
              },
              timeoutMs: 5000,
            },
            {
              order: 2,
              action: 'fill',
              target: field.selector,
              value: 'x'.repeat(field.maxLength + 1),
              assertion: {
                type: 'value',
                expected: 'x'.repeat(field.maxLength),
                description: `Input truncated to ${field.maxLength} characters`,
              },
              timeoutMs: 5000,
            },
            {
              order: 3,
              action: 'fill',
              target: field.selector,
              value: 'x'.repeat(field.maxLength - 1),
              assertion: {
                type: 'value',
                expected: 'x'.repeat(field.maxLength - 1),
                description: `${field.maxLength - 1} characters accepted normally`,
              },
              timeoutMs: 5000,
            },
          ],
          expectedResults: [
            `Field accepts exactly ${field.maxLength} characters`,
            `Field does not accept ${field.maxLength + 1} characters`,
            'Boundary behavior is consistent',
          ],
          sourcePage: analysis.pageUrl,
          sourceElement: field.selector,
          priority: 'medium',
          tags: ['boundary', 'max-length'],
        });
      }
    }

    // Min/Max numeric boundary tests
    for (const field of form.fields) {
      if (field.type === 'number' || field.type === 'range') {
        const steps: any[] = [];

        if (field.min !== null) {
          const minNum = parseFloat(field.min);
          steps.push({
            order: steps.length + 1,
            action: 'fill' as const,
            target: field.selector,
            value: String(minNum - 1),
            assertion: {
              type: 'visible',
              description: `Value below minimum (${minNum - 1}) rejected or clamped`,
            },
            timeoutMs: 5000,
          });
          steps.push({
            order: steps.length + 1,
            action: 'fill' as const,
            target: field.selector,
            value: String(minNum),
            assertion: {
              type: 'value',
              expected: String(minNum),
              description: `Minimum value ${minNum} accepted`,
            },
            timeoutMs: 5000,
          });
        }

        if (field.max !== null) {
          const maxNum = parseFloat(field.max);
          steps.push({
            order: steps.length + 1,
            action: 'fill' as const,
            target: field.selector,
            value: String(maxNum + 1),
            assertion: {
              type: 'visible',
              description: `Value above maximum (${maxNum + 1}) rejected or clamped`,
            },
            timeoutMs: 5000,
          });
          steps.push({
            order: steps.length + 1,
            action: 'fill' as const,
            target: field.selector,
            value: String(maxNum),
            assertion: {
              type: 'value',
              expected: String(maxNum),
              description: `Maximum value ${maxNum} accepted`,
            },
            timeoutMs: 5000,
          });
        }

        if (steps.length > 0) {
          tests.push({
            id: `bound-numeric-${this.slugify(field.selector)}`,
            name: `Numeric boundaries: ${field.label || field.name}`,
            category: 'boundary',
            description: `Test numeric input boundaries around min=${field.min} max=${field.max}`,
            steps,
            expectedResults: [
              'Values below minimum are rejected',
              'Values above maximum are rejected',
              'Valid range values are accepted',
            ],
            sourcePage: analysis.pageUrl,
            sourceElement: field.selector,
            priority: 'medium',
            tags: ['boundary', 'numeric'],
          });
        }
      }
    }

    // Special characters / Unicode tests
    const textFields = form.fields.filter(f =>
      f.type === 'text' || f.type === 'textarea' || f.type === 'search'
    );

    if (textFields.length > 0) {
      const specialChars = [
        { value: '!@#$%^&*()_+-=[]{}|;:,.<>?', desc: 'special characters' },
        { value: '你好世界 مرحبا بالعالم こんにちは', desc: 'Unicode/multibyte' },
        { value: '😀🎉🚀💻🔥', desc: 'emoji' },
        { value: '\u0000\u0001\u0002', desc: 'control characters' },
        { value: '𝟘𝟙𝟚𝟛𝟜𝟝', desc: 'mathematical alphanumerics' },
      ];

      tests.push({
        id: `bound-special-${this.slugify(form.selector)}`,
        name: `Special character handling: ${form.selector}`,
        category: 'boundary',
        description: 'Verify form handles special characters, Unicode, and emoji',
        steps: textFields.slice(0, 3).flatMap((field, fi) =>
          specialChars.map((sc, si) => ({
            order: fi * specialChars.length + si + 1,
            action: 'fill' as const,
            target: field.selector,
            value: sc.value,
            assertion: {
              type: 'visible',
              description: `${sc.desc} handled in "${field.label || field.name}"`,
            },
            timeoutMs: 5000,
          }))
        ),
        expectedResults: [
          'Special characters are handled without crashes',
          'Unicode text is preserved correctly',
          'No encoding issues',
        ],
        sourcePage: analysis.pageUrl,
        priority: 'medium',
        tags: ['boundary', 'unicode', 'special-chars'],
      });
    }

    // Empty form submission
    if (form.fields.length > 0) {
      tests.push({
        id: `bound-empty-form-${this.slugify(form.selector)}`,
        name: `Empty form submission: ${form.selector}`,
        category: 'boundary',
        description: 'Submit form with all fields empty',
        steps: [
          ...form.fields.map((field, i) => ({
            order: i + 1,
            action: (field.type === 'select' ? 'selectOption' : 'fill') as any,
            target: field.selector,
            value: '',
            assertion: { type: 'visible', description: `Cleared "${field.label || field.name}"` },
            timeoutMs: 3000,
          })),
          ...(form.submitButton ? [{
            order: form.fields.length + 1,
            action: 'click' as const,
            target: form.submitButton.selector,
            assertion: { type: 'visible', description: 'Submit clicked' },
            timeoutMs: 5000,
          }] : []),
        ],
        expectedResults: [
          'Required fields show validation errors',
          'Form does not submit successfully if required fields exist',
          'No server errors',
        ],
        sourcePage: analysis.pageUrl,
        priority: 'high',
        tags: ['boundary', 'empty', 'form'],
      });
    }

    return tests;
  }

  private generateContentBoundaryTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Very large page content test
    if (analysis.domStats.totalElements > 100) {
      tests.push({
        id: `bound-large-page-${this.slugify(analysis.pageUrl)}`,
        name: `Large page rendering (${analysis.domStats.totalElements} elements)`,
        category: 'boundary',
        description: 'Verify page with large DOM renders without performance issues',
        steps: [
          {
            order: 1,
            action: 'goto',
            target: analysis.pageUrl,
            assertion: { type: 'visible', description: 'Large DOM page loads without errors' },
            timeoutMs: 30000,
          },
          {
            order: 2,
            action: 'scrollIntoView',
            target: 'footer, body > *:last-child',
            assertion: { type: 'visible', description: 'Page bottom renders correctly' },
            timeoutMs: 10000,
          },
        ],
        expectedResults: ['Page renders all elements', 'No layout thrashing', 'Scroll works'],
        sourcePage: analysis.pageUrl,
        priority: 'low',
        tags: ['boundary', 'performance', 'large-page'],
      });
    }

    // Zero-content / empty states
    tests.push({
      id: `bound-empty-states-${this.slugify(analysis.pageUrl)}`,
      name: 'Empty state handling',
      category: 'boundary',
      description: 'Verify page handles edge cases gracefully',
      steps: [{
        order: 1,
        action: 'goto',
        target: analysis.pageUrl,
        assertion: { type: 'visible', description: 'Page handles initial state' },
        timeoutMs: 15000,
      }],
      expectedResults: ['No blank screens', 'Loading states are shown if applicable', 'No infinite loops'],
      sourcePage: analysis.pageUrl,
      priority: 'low',
      tags: ['boundary', 'empty-state'],
    });

    return tests;
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  }
}
