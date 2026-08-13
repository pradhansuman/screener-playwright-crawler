// form-analyzer.ts — Deep form field analysis including validation rules

import { Page } from 'playwright';
import { DiscoveredForm, FormField } from '../types';

export interface FormValidationRule {
  field: FormField;
  rules: {
    required: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
    emailFormat: boolean;
    urlFormat: boolean;
    customValidation: boolean;
  };
}

/**
 * Advanced form analyzer.
 * Maps every field, detects validation constraints, input masks, and dependencies.
 */
export class FormAnalyzer {
  /**
   * Analyze all forms with deep inspection
   */
  async analyzeForms(page: Page): Promise<DiscoveredForm[]> {
    return page.evaluate(() => {
      const forms = document.querySelectorAll('form');
      const results: any[] = [];

      for (const form of forms) {
        const fields: any[] = [];
        const inputs = form.querySelectorAll(
          'input:not([type="hidden"]), select, textarea'
        );

        for (const el of inputs) {
          const tag = el.tagName.toLowerCase();
          const input = el as HTMLInputElement;
          const select = el as HTMLSelectElement;
          const textarea = el as HTMLTextAreaElement;

          // Build robust selector
          let selector = '';
          if (input.id) {
            selector = `#${CSS.escape(input.id)}`;
          } else if (input.name) {
            selector = `${tag}[name="${input.name.replace(/"/g, '\\"')}"]`;
          } else if (input.getAttribute('data-testid')) {
            selector = `[data-testid="${input.getAttribute('data-testid')}"]`;
          } else {
            selector = `${tag}:nth-child(${Array.from((input.parentElement?.children || [])).indexOf(input) + 1})`;
          }

          // Find label
          let label = '';
          if (input.id) {
            const labelEl = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (labelEl) label = labelEl.textContent?.trim() || '';
          }
          if (!label) {
            const parentLabel = input.closest('label');
            if (parentLabel) {
              label = parentLabel.textContent?.trim() || '';
              // Remove input's own text if any
              label = label.replace(input.value || '', '').trim();
            }
          }
          if (!label) {
            const ariaLabel = input.getAttribute('aria-label');
            if (ariaLabel) label = ariaLabel;
          }
          if (!label) {
            const placeholder = input.placeholder;
            if (placeholder) label = placeholder;
          }

          // Options for select
          let options: { value: string; text: string }[] = [];
          if (tag === 'select') {
            options = Array.from(select.options).map(o => ({
              value: o.value,
              text: o.text.trim(),
            }));
          }

          // Determine real input type
          let realType = input.type || tag;
          if (tag === 'textarea') realType = 'textarea';
          if (tag === 'select') realType = 'select';
          if (input.type === 'email') realType = 'email';
          if (input.type === 'password') realType = 'password';
          if (input.type === 'number') realType = 'number';
          if (input.type === 'tel') realType = 'tel';
          if (input.type === 'url') realType = 'url';
          if (input.type === 'date') realType = 'date';
          if (input.type === 'checkbox') realType = 'checkbox';
          if (input.type === 'radio') realType = 'radio';
          if (input.type === 'file') realType = 'file';
          if (input.type === 'search') realType = 'search';

          // Detect custom validation attributes
          const hasValidation = !!(
            input.required ||
            input.pattern ||
            input.minLength > -1 ||
            input.maxLength > -1 ||
            input.min ||
            input.max ||
            input.getAttribute('data-val') ||
            input.getAttribute('ng-pattern') ||
            input.getAttribute('v-validate')
          );

          fields.push({
            selector,
            name: input.name || input.id || '',
            type: realType,
            label,
            placeholder: input.placeholder || '',
            required: input.required || input.getAttribute('aria-required') === 'true',
            maxLength: input.maxLength > -1 ? input.maxLength : null,
            minLength: input.minLength > -1 ? input.minLength : null,
            pattern: input.pattern || null,
            min: input.min || null,
            max: input.max || null,
            options,
            defaultValue: input.value || (tag === 'select' ? select.value : '') || '',
            autocomplete: input.autocomplete || '',
            hasCustomValidation: hasValidation,
            isReadonly: input.readOnly,
            isDisabled: input.disabled,
            inputMode: input.getAttribute('inputmode') || '',
            ariaDescribedby: input.getAttribute('aria-describedby') || '',
          } as any);
        }

        // Find submit button
        let submitButton: any = null;
        const submitBtns = form.querySelectorAll(
          'button[type="submit"], input[type="submit"], button:not([type])'
        );
        if (submitBtns.length > 0) {
          const btn = submitBtns[0] as HTMLElement;
          submitButton = {
            selector: btn.id ? `#${CSS.escape(btn.id)}` : 'button[type="submit"]',
            text: btn.textContent?.trim() || '',
          };
        }

        // Detect form framework hints
        const formClass = form.className || '';
        const usesReactHookForm = formClass.includes('react-hook-form') ||
          form.querySelector('[data-rhf]') !== null;
        const usesFormik = formClass.includes('formik') ||
          form.querySelector('[data-formik]') !== null;

        results.push({
          selector: form.id ? `#${CSS.escape(form.id)}` : `form[action="${form.getAttribute('action') || ''}"]`,
          action: form.getAttribute('action') || window.location.href,
          method: (form.getAttribute('method') || 'GET').toUpperCase(),
          enctype: form.getAttribute('enctype') || 'application/x-www-form-urlencoded',
          fields,
          submitButton,
          fieldCount: fields.length,
          hasFileUpload: fields.some((f: any) => f.realType === 'file'),
          hasCaptcha: /captcha|recaptcha|hcaptcha|turnstile/i.test(form.innerHTML),
          framework: usesReactHookForm ? 'react-hook-form' : usesFormik ? 'formik' : 'native',
        });
      }

      return results;
    });
  }

  /**
   * Detect field-level validation rules
   */
  async detectValidation(page: Page, form: DiscoveredForm): Promise<FormValidationRule[]> {
    return page.evaluate((formSelector) => {
      const form = document.querySelector(formSelector);
      if (!form) return [];

      const rules: any[] = [];

      for (const field of form.querySelectorAll('input, select, textarea')) {
        const input = field as HTMLInputElement;
        if (input.type === 'hidden') continue;

        rules.push({
          fieldSelector: input.id ? `#${CSS.escape(input.id)}` : `[name="${input.name}"]`,
          rules: {
            required: input.required,
            minLength: input.minLength > -1 ? input.minLength : undefined,
            maxLength: input.maxLength > -1 ? input.maxLength : undefined,
            pattern: input.pattern || undefined,
            min: input.min || undefined,
            max: input.max || undefined,
            emailFormat: input.type === 'email',
            urlFormat: input.type === 'url',
            customValidation: !!(
              input.getAttribute('data-val-required') ||
              input.getAttribute('data-val-regex') ||
              input.getAttribute('data-val-length') ||
              input.getAttribute('ng-pattern') ||
              input.getAttribute('data-parsley-required')
            ),
          },
        });
      }

      return rules;
    }, form.selector);
  }

  /**
   * Generate test payloads for form fields
   */
  generateTestPayloads(fields: FormField[]): Record<string, string[]> {
    const payloads: Record<string, string[]> = {};

    for (const field of fields) {
      const key = field.name || field.selector;
      const payloadsForField: string[] = [];

      // Happy-path values
      payloadsForField.push(this.getValidValue(field));

      // Negative values
      if (field.type === 'email') {
        payloadsForField.push('not-an-email', '', '@', 'test@', 'test@.com');
      } else if (field.type === 'number') {
        payloadsForField.push('abc', '-1', '99999999999999999999');
        if (field.min) payloadsForField.push(String(parseFloat(field.min) - 1));
        if (field.max) payloadsForField.push(String(parseFloat(field.max) + 1));
      } else if (field.type === 'url') {
        payloadsForField.push('not-a-url', 'ftp://invalid.com', '');
      } else if (field.type === 'password') {
        payloadsForField.push('a', '123456', '');
      }

      // Boundary values
      if (field.maxLength) {
        payloadsForField.push('x'.repeat(field.maxLength + 1));
        payloadsForField.push('x'.repeat(field.maxLength));
      }

      if (field.required) {
        payloadsForField.push('');
      }

      // XSS probes
      payloadsForField.push('<script>alert(1)</script>', '<img src=x onerror=alert(1)>');

      // SQL injection probes
      payloadsForField.push("' OR '1'='1", '1; DROP TABLE users;--');

      payloads[key] = payloadsForField;
    }

    return payloads;
  }

  private getValidValue(field: FormField): string {
    switch (field.type) {
      case 'email': return 'user@example.com';
      case 'password': return 'SecureP@ssw0rd!';
      case 'number':
        if (field.min && field.max) return String((parseFloat(field.min) + parseFloat(field.max)) / 2);
        return '50';
      case 'url': return 'https://example.com';
      case 'tel': return '+15551234567';
      case 'date': return '2026-08-15';
      default: return 'Valid Input';
    }
  }
}
