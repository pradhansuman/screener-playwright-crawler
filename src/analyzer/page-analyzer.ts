// page-analyzer.ts — Full-page DOM and structure analysis

import { BrowserContext, Page } from 'playwright';
import {
  PageAnalysis, InteractiveElement, DiscoveredForm, DiscoveredApi,
  DiscoveredWorkflow, AccessibilityIssue, VisualElement, SecurityConcern,
  DomStats, ElementType, AriaInfo, FormField,
} from '../types';

export class PageAnalyzer {
  private context: BrowserContext;

  constructor(context: BrowserContext) {
    this.context = context;
  }

  /**
   * Perform a complete analysis of a page
   */
  async analyze(url: string): Promise<PageAnalysis> {
    const page = await this.context.newPage();

    try {
      // Start monitoring network
      const apiCalls: DiscoveredApi[] = [];
      page.on('response', async (response) => {
        const req = response.request();
        // Capture XHR/fetch calls
        if (
          req.resourceType() === 'xhr' ||
          req.resourceType() === 'fetch' ||
          response.headers()['content-type']?.includes('json')
        ) {
          try {
            apiCalls.push({
              url: response.url(),
              method: req.method(),
              statusCode: response.status(),
              requestHeaders: req.headers(),
              responseHeaders: response.headers(),
              requestBody: req.postDataJSON() ?? null,
              responseBody: await response.json().catch(() => null),
              durationMs: 0,
              triggeredBy: req.url(),
              pageUrl: url,
            });
          } catch { /* skip */ }
        }
      });

      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Wait extra for SPAs
      await page.waitForTimeout(2000);

      const title = await page.title();

      const [
        domStats,
        interactiveElements,
        forms,
        accessibilityIssues,
        visualElements,
        securityConcerns,
      ] = await Promise.all([
        this.analyzeDom(page),
        this.discoverInteractiveElements(page),
        this.analyzeForms(page),
        this.checkAccessibility(page),
        this.captureVisualSnapshot(page),
        this.auditSecurity(page, url),
      ]);

      // Discover workflows
      const workflows = await this.discoverWorkflows(page, url, interactiveElements);

      return {
        pageUrl: url,
        title,
        domStats,
        interactiveElements,
        forms,
        apis: apiCalls,
        workflows,
        accessibilityIssues,
        visualElements,
        securityConcerns,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Analyze DOM structure statistics
   */
  private async analyzeDom(page: Page): Promise<DomStats> {
    return page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const interactive = document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [onclick], [tabindex]'
      );
      return {
        totalElements: all.length,
        interactiveElements: interactive.length,
        forms: document.querySelectorAll('form').length,
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        headings: {
          h1: document.querySelectorAll('h1').length,
          h2: document.querySelectorAll('h2').length,
          h3: document.querySelectorAll('h3').length,
          h4: document.querySelectorAll('h4').length,
          h5: document.querySelectorAll('h5').length,
          h6: document.querySelectorAll('h6').length,
        },
        scripts: document.querySelectorAll('script').length,
        stylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
      };
    });
  }

  /**
   * Discover all interactive elements on the page
   */
  private async discoverInteractiveElements(page: Page): Promise<InteractiveElement[]> {
    return page.evaluate(() => {
      const selectors = [
        'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
        '[onclick]', '[data-action]', '[data-testid]',
        '.btn', '[class*="button"]',
      ];

      const elements = document.querySelectorAll(selectors.join(','));
      const results: any[] = [];
      const seen = new Set<Element>();

      for (const el of elements) {
        if (seen.has(el)) continue;
        seen.add(el);

        const rect = el.getBoundingClientRect();
        const isVisible = !!(el as HTMLElement).offsetParent && rect.width > 0 && rect.height > 0;
        const htmlEl = el as HTMLElement;
        const inputEl = el as HTMLInputElement;

        // Determine element type
        let elementType = 'other' as string;
        const tag = el.tagName.toLowerCase();
        if (tag === 'a') {
          elementType = (el as HTMLElement).getAttribute('role') === 'button' ? 'button' : 'link';
        } else if (tag === 'button') {
          elementType = 'button';
        } else if (tag === 'input') {
          const type = (el as HTMLInputElement).type;
          if (type === 'submit') elementType = 'submit';
          else if (type === 'checkbox') elementType = 'checkbox';
          else if (type === 'radio') elementType = 'radio';
          else if (type === 'file') elementType = 'file';
          else elementType = 'input';
        } else if (tag === 'select') {
          elementType = 'select';
        } else if (tag === 'textarea') {
          elementType = 'textarea';
        }

        // Build CSS selector
        const buildSelector = (el: Element): string => {
          if (el.id) return `#${CSS.escape(el.id)}`;
          if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
          if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
          const tag = el.tagName.toLowerCase();
          const name = el.getAttribute('name');
          if (name) return `${tag}[name="${name}"]`;
          const cls = Array.from(el.classList).slice(0, 2).join('.');
          if (cls) return `${tag}.${cls}`;
          return tag;
        };

        // Get ARIA info
        const aria: AriaInfo = {
          role: htmlEl.getAttribute('role'),
          label: htmlEl.getAttribute('aria-label'),
          describedBy: htmlEl.getAttribute('aria-describedby'),
          expanded: htmlEl.getAttribute('aria-expanded') === 'true' ? true :
                    htmlEl.getAttribute('aria-expanded') === 'false' ? false : null,
          selected: htmlEl.getAttribute('aria-selected') === 'true' ? true :
                    htmlEl.getAttribute('aria-selected') === 'false' ? false : null,
          level: parseInt(htmlEl.getAttribute('aria-level') || '') || null,
          hasPopup: htmlEl.getAttribute('aria-haspopup'),
          required: htmlEl.getAttribute('aria-required') === 'true' || inputEl.required,
          invalid: htmlEl.getAttribute('aria-invalid') === 'true',
        };

        // Find parent form
        let parentForm: string | undefined;
        const form = el.closest('form');
        if (form) {
          parentForm = form.id ? `#${form.id}` : `form[action="${form.getAttribute('action') || ''}"]`;
        }

        results.push({
          selector: buildSelector(el),
          tagName: tag,
          elementType,
          text: (htmlEl.textContent || inputEl.value || inputEl.placeholder || '').trim().slice(0, 200),
          attributes: {
            id: htmlEl.id || '',
            name: htmlEl.getAttribute('name') || '',
            type: htmlEl.getAttribute('type') || '',
            href: htmlEl.getAttribute('href') || '',
            placeholder: htmlEl.getAttribute('placeholder') || '',
            title: htmlEl.getAttribute('title') || '',
            'data-testid': htmlEl.getAttribute('data-testid') || '',
          },
          boundingBox: isVisible ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          isVisible,
          isEnabled: !(htmlEl as HTMLButtonElement).disabled && !htmlEl.hasAttribute('aria-disabled'),
          parentFormSelector: parentForm,
          aria,
        });
      }

      return results;
    });
  }

  /**
   * Analyze all forms on the page
   */
  private async analyzeForms(page: Page): Promise<DiscoveredForm[]> {
    return page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const results: any[] = [];

      for (const form of forms) {
        const fields: any[] = [];
        const formElements = form.querySelectorAll('input, select, textarea, button');

        let submitButton: any = null;

        for (const el of formElements) {
          const tag = el.tagName.toLowerCase();
          const input = el as HTMLInputElement;

          if (tag === 'button' || (tag === 'input' && (input.type === 'submit' || input.type === 'button'))) {
            submitButton = {
              selector: input.id ? `#${input.id}` : `button[type="submit"]`,
              text: input.textContent || input.value || '',
            };
            continue;
          }

          if (input.type === 'hidden') continue;

          // Determine label
          let label = '';
          const labelEl = form.querySelector(`label[for="${input.id}"]`);
          if (labelEl) {
            label = labelEl.textContent?.trim() || '';
          } else {
            const parentLabel = input.closest('label');
            if (parentLabel) {
              label = parentLabel.textContent?.replace(input.value || '', '').trim() || '';
            }
          }

          // Get select options
          let options: { value: string; text: string }[] = [];
          if (tag === 'select') {
            const select = el as HTMLSelectElement;
            options = Array.from(select.options).map(o => ({
              value: o.value,
              text: o.text,
            }));
          }

          fields.push({
            selector: input.id ? `#${input.id}` : `${tag}[name="${input.name}"]`,
            name: input.name || input.id || '',
            type: input.type || tag,
            label,
            placeholder: input.placeholder || '',
            required: input.required,
            maxLength: input.maxLength > -1 ? input.maxLength : null,
            minLength: input.minLength > -1 ? input.minLength : null,
            pattern: input.pattern || null,
            min: input.min || null,
            max: input.max || null,
            options,
            defaultValue: input.value || '',
          });
        }

        results.push({
          selector: form.id ? `#${form.id}` : `form[action="${form.getAttribute('action') || ''}"]`,
          action: form.getAttribute('action') || window.location.href,
          method: (form.getAttribute('method') || 'GET').toUpperCase(),
          fields,
          submitButton,
          fieldCount: fields.length,
          hasFileUpload: fields.some((f: any) => f.type === 'file'),
          hasCaptcha: form.innerHTML.includes('captcha') || form.innerHTML.includes('recaptcha'),
        });
      }

      return results;
    });
  }

  /**
   * Run basic accessibility checks
   */
  private async checkAccessibility(page: Page): Promise<AccessibilityIssue[]> {
    return page.evaluate(() => {
      const issues: any[] = [];

      // Check image alt text
      document.querySelectorAll('img:not([alt])').forEach(el => {
        issues.push({
          selector: el.tagName + (el.id ? '#' + el.id : ''),
          rule: 'image-alt',
          impact: 'critical',
          description: 'Image missing alt attribute',
          wcag: 'WCAG 1.1.1',
          suggestion: 'Add a descriptive alt attribute to the image',
        });
      });

      // Check empty links
      document.querySelectorAll('a[href]:not([aria-label])').forEach(el => {
        const text = el.textContent?.trim();
        if (!text && !(el as HTMLElement).querySelector('img[alt]')) {
          issues.push({
            selector: el.tagName + (el.id ? '#' + el.id : ''),
            rule: 'link-text',
            impact: 'serious',
            description: 'Link has no visible text or accessible name',
            wcag: 'WCAG 2.4.4',
            suggestion: 'Add descriptive text or an aria-label to the link',
          });
        }
      });

      // Check form labels
      document.querySelectorAll('input:not([type="hidden"]):not([aria-label]):not([aria-labelledby])').forEach(el => {
        const id = el.id;
        if (id && !document.querySelector(`label[for="${id}"]`) && !el.closest('label')) {
          issues.push({
            selector: `#${CSS.escape(id)}`,
            rule: 'label',
            impact: 'critical',
            description: 'Form input missing associated label',
            wcag: 'WCAG 1.3.1',
            suggestion: 'Add a <label> element with for attribute or aria-label',
          });
        }
      });

      // Check color contrast (heuristic)
      document.querySelectorAll('[style*="color"]').forEach(el => {
        const style = (el as HTMLElement).style;
        if (style.color && style.backgroundColor) {
          // Simple heuristic — flag light-gray text
          const color = style.color.toLowerCase();
          if (color.includes('ccc') || color.includes('ddd') || color.includes('eee') ||
              color.includes('999') || color.includes('aaa')) {
            issues.push({
              selector: el.tagName + (el.id ? '#' + el.id : ''),
              rule: 'color-contrast',
              impact: 'serious',
              description: 'Potential low-contrast text detected',
              wcag: 'WCAG 1.4.3',
              suggestion: 'Ensure text meets 4.5:1 contrast ratio minimum',
            });
          }
        }
      });

      // Check missing lang attribute
      if (!document.documentElement.getAttribute('lang')) {
        issues.push({
          selector: 'html',
          rule: 'html-lang',
          impact: 'moderate',
          description: 'HTML element missing lang attribute',
          wcag: 'WCAG 3.1.1',
          suggestion: 'Add lang="en" or appropriate language code to html element',
        });
      }

      // Check heading hierarchy
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      let prevLevel = 0;
      headings.forEach(el => {
        const level = parseInt(el.tagName.charAt(1));
        if (prevLevel > 0 && level > prevLevel + 1) {
          issues.push({
            selector: el.tagName + (el.id ? '#' + el.id : ''),
            rule: 'heading-order',
            impact: 'moderate',
            description: `Heading level skipped: h${prevLevel} to h${level}`,
            wcag: 'WCAG 1.3.1',
            suggestion: 'Use sequential heading levels without skipping',
          });
        }
        prevLevel = level;
      });

      return issues;
    });
  }

  /**
   * Capture visual snapshot data
   */
  private async captureVisualSnapshot(page: Page): Promise<VisualElement[]> {
    return page.evaluate(() => {
      const elements: any[] = [];
      const targets = document.querySelectorAll(
        'header, footer, nav, main, section, [class*="hero"], [class*="banner"], [class*="card"], img, svg'
      );

      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const computed = window.getComputedStyle(el);
        elements.push({
          selector: el.tagName.toLowerCase() + (el.id ? '#' + CSS.escape(el.id) : ''),
          tagName: el.tagName.toLowerCase(),
          boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          computedStyle: {
            display: computed.display,
            position: computed.position,
            color: computed.color,
            backgroundColor: computed.backgroundColor,
            fontSize: computed.fontSize,
            fontWeight: computed.fontWeight,
            width: computed.width,
            height: computed.height,
          },
          text: el.textContent?.trim().slice(0, 100) || '',
          isImage: el.tagName === 'IMG' || el.tagName === 'SVG',
        });
      }

      return elements;
    });
  }

  /**
   * Security audit
   */
  private async auditSecurity(page: Page, url: string): Promise<SecurityConcern[]> {
    return page.evaluate((pageUrl) => {
      const concerns: any[] = [];

      // Check for insecure forms
      document.querySelectorAll('form').forEach(form => {
        const action = form.getAttribute('action') || '';
        if (action.startsWith('http:') && pageUrl.startsWith('https:')) {
          concerns.push({
            type: 'insecure-form',
            severity: 'high',
            description: 'Form submits over HTTP on an HTTPS page',
            location: form.id ? `#${form.id}` : `form[action="${action}"]`,
            evidence: `Action: ${action}`,
          });
        }
      });

      // Check for missing CSP via meta
      const csp = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (!csp) {
        concerns.push({
          type: 'csp',
          severity: 'medium',
          description: 'No Content-Security-Policy meta tag detected',
          location: pageUrl,
          evidence: 'Missing CSP header or meta tag',
        });
      }

      // Check for X-Frame-Options via meta (clickjacking)
      if (!document.querySelector('meta[http-equiv="X-Frame-Options"]')) {
        concerns.push({
          type: 'clickjacking',
          severity: 'medium',
          description: 'No X-Frame-Options or frame-ancestors directive detected',
          location: pageUrl,
          evidence: 'Page may be frameable',
        });
      }

      // Check for inline event handlers (potential XSS vector)
      const inlineHandlers = document.querySelectorAll('[onclick], [onerror], [onload], [onmouseover]');
      if (inlineHandlers.length > 0) {
        concerns.push({
          type: 'xss',
          severity: 'low',
          description: `${inlineHandlers.length} inline event handlers detected`,
          location: pageUrl,
          evidence: 'Inline event handlers can be XSS vectors if content is user-generated',
        });
      }

      return concerns;
    }, url);
  }

  /**
   * Discover multi-step workflows (login, checkout, search, etc.)
   */
  private async discoverWorkflows(
    page: Page,
    url: string,
    elements: InteractiveElement[],
  ): Promise<DiscoveredWorkflow[]> {
    const workflows: DiscoveredWorkflow[] = [];

    // Login workflow
    const loginLinks = elements.filter(e =>
      (e.elementType === 'link' || e.elementType === 'button') &&
      /login|sign.?in|log.?in/i.test(e.text)
    );
    if (loginLinks.length > 0) {
      workflows.push({
        id: 'workflow-login',
        name: 'Login Flow',
        steps: [
          { order: 1, action: 'navigate', targetSelector: url, description: 'Navigate to site' },
          { order: 2, action: 'click', targetSelector: loginLinks[0].selector, description: 'Click login link' },
        ],
        startUrl: url,
        description: 'User authentication flow',
        estimatedDurationMs: 5000,
      });
    }

    // Search workflow
    const searchInputs = elements.filter(e =>
      e.elementType === 'input' &&
      /search|find|query/i.test(e.text + (e.attributes.placeholder || '') + (e.attributes.name || ''))
    );
    if (searchInputs.length > 0) {
      workflows.push({
        id: 'workflow-search',
        name: 'Search Flow',
        steps: [
          { order: 1, action: 'type', targetSelector: searchInputs[0].selector, value: 'test query', description: 'Enter search query' },
          { order: 2, action: 'pressKey', targetSelector: searchInputs[0].selector, value: 'Enter', description: 'Submit search' },
        ],
        startUrl: url,
        description: 'Search functionality flow',
        estimatedDurationMs: 3000,
      });
    }

    // Form submission workflows
    const forms = await this.analyzeForms(page);
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      if (form.fields.length >= 2) {
        const steps = form.fields.map((field, idx) => ({
          order: idx + 1,
          action: field.type === 'select' ? 'select' as const :
                  field.type === 'checkbox' ? 'click' as const : 'type' as const,
          targetSelector: field.selector,
          value: this.generateSampleValue(field),
          description: `Fill ${field.label || field.name || `field ${idx + 1}`}`,
        }));

        if (form.submitButton) {
          steps.push({
            order: steps.length + 1,
            action: 'click' as const,
            targetSelector: form.submitButton.selector,
            description: 'Submit form',
          });
        }

        workflows.push({
          id: `workflow-form-${i}`,
          name: `Form: ${form.selector}`,
          steps,
          startUrl: url,
          description: `Complete form submission for ${form.selector}`,
          estimatedDurationMs: steps.length * 1000,
        });
      }
    }

    return workflows;
  }

  /**
   * Generate a sample value for a form field
   */
  private generateSampleValue(field: FormField): string {
    const label = (field.label + ' ' + field.name).toLowerCase();

    if (field.type === 'email') return 'test@example.com';
    if (field.type === 'password') return 'TestPassword123!';
    if (field.type === 'tel' || label.includes('phone')) return '+15551234567';
    if (field.type === 'number') return '42';
    if (field.type === 'url') return 'https://example.com';
    if (field.type === 'date') return '2026-08-10';
    if (label.includes('name')) return 'Test User';
    if (label.includes('address')) return '123 Test St';
    if (label.includes('city')) return 'San Francisco';
    if (label.includes('zip') || label.includes('postal')) return '94105';
    if (label.includes('country')) {
      if (field.type === 'select' && field.options.length > 0) {
        return field.options[0].value;
      }
      return 'US';
    }
    if (field.type === 'select' && field.options.length > 0) {
      return field.options[0].value;
    }

    return 'Test Value';
  }
}
