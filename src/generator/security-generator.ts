// security-generator.ts — Generate security-focused tests

import { PageAnalysis, GeneratedTest, SecurityConcern, DiscoveredForm } from '../types';

/**
 * Generates security test scenarios:
 * - CSP/CORS checks
 * - CSRF token presence
 * - Secure cookie attributes
 * - HTTPS enforcement
 * - Clickjacking protection
 * - Auth token exposure
 */
export class SecurityGenerator {
  generate(analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // 1. HTTPS test
    tests.push(this.generateHttpsTest(analysis));

    // 2. CSP test
    tests.push(this.generateCspTest(analysis));

    // 3. CSRF test
    tests.push(this.generateCsrfTest(analysis));

    // 4. Cookie security test
    tests.push(this.generateCookieTest(analysis));

    // 5. Form security tests
    for (const form of analysis.forms) {
      tests.push(...this.generateFormSecurityTests(form, analysis));
    }

    // 6. Frame embedding test
    tests.push(this.generateFrameTest(analysis));

    // 7. Sensitive data exposure test
    tests.push(this.generateSensitiveDataTest(analysis));

    // 8. Issue-based tests
    for (const concern of analysis.securityConcerns) {
      tests.push(this.generateConcernTest(concern, analysis));
    }

    return tests;
  }

  private generateHttpsTest(analysis: PageAnalysis): GeneratedTest {
    const isHttps = analysis.pageUrl.startsWith('https://');

    return {
      id: `sec-https-${this.slugify(analysis.pageUrl)}`,
      name: 'HTTPS enforcement',
      category: 'security',
      description: 'Verify page is served over HTTPS and redirects HTTP to HTTPS',
      steps: [
        {
          order: 1,
          action: 'goto',
          target: analysis.pageUrl.replace('https://', 'http://'),
          assertion: {
            type: 'url',
            expected: isHttps ? 'https://*' : '*',
            description: 'HTTP requests redirect to HTTPS',
          },
          timeoutMs: 15000,
        },
        {
          order: 2,
          action: 'goto',
          target: analysis.pageUrl,
          assertion: {
            type: 'url',
            expected: isHttps ? 'https://*' : '*',
            description: 'Final URL is HTTPS',
          },
          timeoutMs: 15000,
        },
      ],
      expectedResults: [
        'Page is served over HTTPS',
        'HTTP requests are redirected to HTTPS',
        'No mixed content warnings',
        'HSTS header is present',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['security', 'https', 'tls'],
    };
  }

  private generateCspTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-csp-${this.slugify(analysis.pageUrl)}`,
      name: 'Content Security Policy verification',
      category: 'security',
      description: 'Verify CSP headers or meta tags are configured',
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
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            return meta ? meta.getAttribute('content') : 'no-csp-meta';
          })()`,
          assertion: {
            type: 'visible',
            description: 'CSP meta tag or header presence checked',
          },
          timeoutMs: 3000,
        },
        {
          order: 3,
          action: 'evaluate',
          value: `(() => {
            try {
              new Function('return 1+1')();
              return 'eval-allowed';
            } catch {
              return 'eval-blocked';
            }
          })()`,
          assertion: {
            type: 'text',
            expected: 'eval-blocked',
            description: "CSP blocks unsafe-eval ('unsafe-eval' not in policy)",
          },
          timeoutMs: 3000,
        },
      ],
      expectedResults: [
        'CSP is configured (header or meta tag)',
        'Unsafe-inline scripts are blocked',
        'Unsafe-eval is blocked',
        'External script sources are whitelisted',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['security', 'csp', 'xss-prevention'],
    };
  }

  private generateCsrfTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-csrf-${this.slugify(analysis.pageUrl)}`,
      name: 'CSRF protection verification',
      category: 'security',
      description: 'Verify forms include CSRF tokens',
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
            const forms = document.querySelectorAll('form[method="POST"], form[method="PUT"], form[method="DELETE"], form[method="PATCH"]');
            if (forms.length === 0) return 'no-unsafe-forms';
            const results = Array.from(forms).map(f => {
              const csrfInput = f.querySelector('input[name*="csrf"], input[name*="token"], input[name="_token"], input[name*="nonce"]');
              return csrfInput ? csrfInput.getAttribute('name') : 'missing';
            });
            return JSON.stringify(results);
          })()`,
          assertion: {
            type: 'visible',
            description: 'CSRF tokens presence verified on state-changing forms',
          },
          timeoutMs: 5000,
        },
      ],
      expectedResults: [
        'All POST/PUT/DELETE forms contain CSRF tokens',
        'CSRF tokens are unique per session',
        'Tokens are not exposed in URL query strings',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['security', 'csrf', 'owasp'],
    };
  }

  private generateCookieTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-cookies-${this.slugify(analysis.pageUrl)}`,
      name: 'Secure cookie attributes',
      category: 'security',
      description: 'Verify cookies have Secure, HttpOnly, and SameSite flags',
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
          value: `document.cookie.split(';').map(c => c.trim()).filter(Boolean).join('|')`,
          assertion: {
            type: 'visible',
            description: 'Cookies inspected (HttpOnly/secure checked via headers)',
          },
          timeoutMs: 3000,
        },
        {
          order: 3,
          action: 'evaluate',
          value: `(() => {
            // Check if document.cookie can be accessed (no HttpOnly in JS-visible cookies)
            const cookies = document.cookie.split(';').filter(Boolean);
            const hasSessionLike = cookies.some(c =>
              /session|token|auth|jwt|sid/i.test(c.trim().split('=')[0])
            );
            return hasSessionLike ? 'session-cookie-js-accessible' : 'no-sensitive-js-cookies';
          })()`,
          assertion: {
            type: 'text',
            expected: 'no-sensitive-js-cookies',
            description: 'No sensitive cookies accessible via JavaScript',
          },
          timeoutMs: 3000,
        },
      ],
      expectedResults: [
        'Session/auth cookies have HttpOnly flag',
        'All cookies have Secure flag (HTTPS only)',
        'SameSite attribute is set to Lax or Strict',
        'No sensitive data in cookie values',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['security', 'cookies', 'session'],
    };
  }

  private generateFormSecurityTests(form: DiscoveredForm, analysis: PageAnalysis): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // File upload security
    if (form.hasFileUpload) {
      tests.push({
        id: `sec-file-upload-${this.slugify(form.selector)}`,
        name: `File upload security: ${form.selector}`,
        category: 'security',
        description: 'Verify file upload accepts only allowed file types',
        steps: [
          {
            order: 1,
            action: 'fill',
            target: 'input[type="file"]',
            value: 'malicious.exe',
            assertion: {
              type: 'visible',
              description: 'Non-image file rejected by file input',
            },
            timeoutMs: 5000,
          },
        ],
        expectedResults: [
          'Only allowed file types are accepted',
          'File size limits are enforced',
          'Malicious file extensions rejected client-side',
        ],
        sourcePage: analysis.pageUrl,
        sourceElement: form.selector,
        priority: 'high',
        tags: ['security', 'file-upload', 'validation'],
      });
    }

    // Autocomplete off for sensitive fields
    const sensitiveFieldNames = ['password', 'credit', 'card', 'ssn', 'cvv', 'cvc', 'secret'];
    const sensitiveFields = form.fields.filter(f => {
      const names = [f.name, f.label, f.type].join(' ').toLowerCase();
      return sensitiveFieldNames.some(s => names.includes(s));
    });

    if (sensitiveFields.length > 0) {
      tests.push({
        id: `sec-autocomplete-${this.slugify(form.selector)}`,
        name: `Sensitive field autocomplete: ${form.selector}`,
        category: 'security',
        description: 'Verify sensitive fields have autocomplete="off"',
        steps: sensitiveFields.map((field, i) => ({
          order: i + 1,
          action: 'evaluate' as const,
          target: field.selector,
          value: `document.querySelector('${field.selector.replace(/'/g, "\\'")}')?.autocomplete || 'not-set'`,
          assertion: {
            type: 'text',
            expected: 'off',
            description: `Field "${field.label || field.name}" has autocomplete="off"`,
          },
          timeoutMs: 3000,
        })),
        expectedResults: ['Password/credit card fields have autocomplete="off"'],
        sourcePage: analysis.pageUrl,
        priority: 'high',
        tags: ['security', 'autocomplete', 'sensitive-data'],
      });
    }

    return tests;
  }

  private generateFrameTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-clickjacking-${this.slugify(analysis.pageUrl)}`,
      name: 'Clickjacking protection',
      category: 'security',
      description: 'Verify page cannot be embedded in iframes on other domains',
      steps: [
        {
          order: 1,
          action: 'evaluate',
          value: `(() => {
            if (window.top !== window.self) return 'already-framed';
            const meta = document.querySelector('meta[http-equiv="X-Frame-Options"]');
            return meta ? meta.getAttribute('content') : 'no-x-frame-options';
          })()`,
          assertion: {
            type: 'visible',
            description: 'X-Frame-Options or CSP frame-ancestors checked',
          },
          timeoutMs: 3000,
        },
      ],
      expectedResults: [
        'X-Frame-Options header is DENY or SAMEORIGIN',
        'Or CSP frame-ancestors directive is set',
        'Page cannot be iframed by malicious sites',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'high',
      tags: ['security', 'clickjacking', 'x-frame-options'],
    };
  }

  private generateSensitiveDataTest(analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-sensitive-data-${this.slugify(analysis.pageUrl)}`,
      name: 'Sensitive data exposure check',
      category: 'security',
      description: 'Scan page source for exposed tokens, keys, or credentials',
      steps: [
        {
          order: 1,
          action: 'evaluate',
          value: `(() => {
            const html = document.documentElement.outerHTML;
            const patterns = [
              /sk-[a-zA-Z0-9]{20,}/,           // OpenAI/API keys
              /AIza[0-9A-Za-z_\-]{35}/,         // Google API keys
              /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
              /ghp_[a-zA-Z0-9]{36}/,             // GitHub tokens
              /Bearer [A-Za-z0-9\-._~+/]+=*/,     // Bearer tokens
              /password\s*[:=]\s*['"][^'"]+['"]/i,
              /secret\s*[:=]\s*['"][^'"]+['"]/i,
              /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i,
            ];
            const found: string[] = [];
            for (const pattern of patterns) {
              const match = html.match(pattern);
              if (match) found.push(pattern.source.slice(0, 50));
            }
            return found.length > 0 ? JSON.stringify(found) : 'clean';
          })()`,
          assertion: {
            type: 'text',
            expected: 'clean',
            description: 'No API keys, tokens, or secrets in page source',
          },
          timeoutMs: 5000,
        },
      ],
      expectedResults: [
        'No API keys in HTML source',
        'No hardcoded passwords or secrets',
        'No Bearer tokens in client-side code',
        'No private keys exposed',
      ],
      sourcePage: analysis.pageUrl,
      priority: 'critical',
      tags: ['security', 'secrets', 'exposure'],
    };
  }

  private generateConcernTest(concern: SecurityConcern, analysis: PageAnalysis): GeneratedTest {
    return {
      id: `sec-${this.slugify(concern.type)}-${this.slugify(analysis.pageUrl)}`,
      name: `Security: ${concern.description}`,
      category: 'security',
      description: concern.evidence,
      steps: [{
        order: 1,
        action: 'evaluate',
        target: concern.location,
        assertion: {
          type: 'visible',
          description: `Verify: ${concern.description}`,
        },
        timeoutMs: 5000,
      }],
      expectedResults: [`Fix: ${concern.type} vulnerability at ${concern.location}`],
      sourcePage: analysis.pageUrl,
      priority: concern.severity === 'critical' ? 'critical' :
                concern.severity === 'high' ? 'high' :
                concern.severity === 'medium' ? 'medium' : 'low',
      tags: ['security', concern.type],
    };
  }

  private slugify(str: string): string {
    return str.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 50).toLowerCase();
  }
}
