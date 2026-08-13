// negative-generator.ts — Generate negative/invalid-input tests

import { PageAnalysis, GeneratedTest, DiscoveredForm } from '../types';

/**
 * Generates negative test scenarios:
 * - Invalid email formats
 * - Empty required fields
 * - Boundary violations
 * - SQL injection / XSS payloads
 * - Malformed requests
 */
export class NegativeGenerator {
  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Form negative tests
    for (const form of analysis.forms) {
      tests.push(...this.generateFormNegativeTests(form, analysis));
    }

    // Content security tests
    tests.push(...this.generateContentSecurityTests(analysis));

    return tests;
  }

  private generateFormNegativeTests(form: DiscoveredForm, analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // 1. Test each required field with empty value
    const requiredFields = form.fields.filter(f => f.required);
    if (requiredFields.length > 0) {
      tests.push({
        id: `neg-required-${this.slugify(form.selector)}`,
        name: `Required field validation: ${form.selector}`,
        category: 'negative',
        description: 'Verify all required fields show validation errors when empty',
        steps: requiredFields.map((field, i) => ({
          order: i + 1,
          action: 'fill' as const,
          target: field.selector,
          value: '',
          assertion: {
            type: 'visible',
            description: `Required field "${field.label || field.name}" shows validation error`,
          },
          timeoutMs: 5000,
        })),
        expectedResults: [
          'Each required field shows clear validation error',
          'Form does not submit with empty required fields',
          'Error messages are descriptive',
        ],
        sourcePage: analysis.pageUrl,
        sourceElement: form.selector,
        priority: 'high',
        tags: ['negative', 'validation', 'required'],
      });
    }

    // 2. Email format tests
    const emailFields = form.fields.filter(f => f.type === 'email');
    for (const field of emailFields) {
      const badEmails = [
        { value: 'notanemail', desc: 'missing @' },
        { value: 'missing@', desc: 'missing domain' },
        { value: '@nodomain.com', desc: 'missing local part' },
        { value: 'spaces in@email.com', desc: 'contains spaces' },
        { value: 'x'.repeat(300) + '@toolong.com', desc: 'excessively long' },
      ];

      tests.push({
        id: `neg-email-${this.slugify(field.selector)}`,
        name: `Email validation: ${field.label || field.name}`,
        category: 'negative',
        description: 'Verify email field rejects invalid formats',
        steps: badEmails.map((bad, i) => ({
          order: i + 1,
          action: 'fill' as const,
          target: field.selector,
          value: bad.value,
          assertion: {
            type: 'visible',
            description: `Invalid email "${bad.desc}" triggers validation error`,
          },
          timeoutMs: 5000,
        })),
        expectedResults: ['All invalid email formats rejected', 'Clear error message displayed'],
        sourcePage: analysis.pageUrl,
        priority: 'high',
        tags: ['negative', 'validation', 'email'],
      });
    }

    // 3. XSS injection tests
    const textFields = form.fields.filter(f =>
      ['text', 'textarea', 'search', 'url'].includes(f.type) ||
      !['checkbox', 'radio', 'file', 'submit'].includes(f.type)
    );

    if (textFields.length > 0) {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src=x onerror=alert(1)>',
        '"><script>alert(1)</script>',
        '<svg onload=alert(1)>',
        'javascript:alert(1)',
        '"><img src=x onerror=alert(1)>',
      ];

      tests.push({
        id: `neg-xss-${this.slugify(form.selector)}`,
        name: `XSS protection: ${form.selector}`,
        category: 'negative',
        description: 'Verify form fields sanitize or reject XSS payloads',
        steps: textFields.slice(0, 5).flatMap((field, fi) =>
          xssPayloads.slice(0, 3).map((payload, pi) => ({
            order: fi * 3 + pi + 1,
            action: 'fill' as const,
            target: field.selector,
            value: payload,
            assertion: {
              type: 'visible',
              description: `Field "${field.label || field.name}" handles XSS payload safely`,
            },
            timeoutMs: 5000,
          }))
        ),
        expectedResults: [
          'XSS payloads are sanitized or rejected',
          'No script execution triggered',
          'Page remains stable',
        ],
        sourcePage: analysis.pageUrl,
        priority: 'critical',
        tags: ['negative', 'security', 'xss'],
      });
    }

    // 4. SQL injection tests
    if (textFields.length > 0) {
      const sqlPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "' UNION SELECT * FROM users --",
        "1; DELETE FROM users WHERE 1=1",
        "' OR 1=1 --",
        "admin'--",
      ];

      tests.push({
        id: `neg-sqli-${this.slugify(form.selector)}`,
        name: `SQL Injection protection: ${form.selector}`,
        category: 'negative',
        description: 'Verify form fields handle SQL injection attempts safely',
        steps: textFields.slice(0, 3).flatMap((field, fi) =>
          sqlPayloads.map((payload, pi) => ({
            order: fi * sqlPayloads.length + pi + 1,
            action: 'fill' as const,
            target: field.selector,
            value: payload,
            assertion: {
              type: 'visible',
              description: `SQL injection payload handled safely in "${field.label || field.name}"`,
            },
            timeoutMs: 5000,
          }))
        ),
        expectedResults: [
          'SQL injection attempts do not cause errors or unauthorized access',
          'Input is properly sanitized',
        ],
        sourcePage: analysis.pageUrl,
        priority: 'critical',
        tags: ['negative', 'security', 'sql-injection'],
      });
    }

    return tests;
  }

  private generateContentSecurityTests(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Console error check
    tests.push({
      id: `neg-console-${this.slugify(analysis.pageUrl)}`,
      name: 'No console errors on page load',
      category: 'negative',
      description: 'Verify page loads without JavaScript errors in console',
      steps: [{
        order: 1,
        action: 'goto',
        target: analysis.pageUrl,
        assertion: { type: 'visible', description: 'No console errors detected' },
        timeoutMs: 15000,
      }],
      expectedResults: ['Zero console errors', 'No 404s for critical resources'],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['negative', 'errors', 'console'],
    });

    return tests;
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  }
}
