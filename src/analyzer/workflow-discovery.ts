// workflow-discovery.ts — Multi-step workflow identification and modeling

import { Page } from 'playwright';
import { DiscoveredWorkflow, WorkflowStep, InteractiveElement } from '../types';

/**
 * Discovers complex multi-step workflows by analyzing:
 * - Page navigation patterns
 * - Multi-page forms (wizards)
 * - Authentication flows
 * - Checkout/payment flows
 * - Search → results → detail flows
 */
export class WorkflowDiscovery {
  /**
   * Discover all workflows starting from a page
   */
  async discover(
    page: Page,
    elements: InteractiveElement[],
  ): Promise<DiscoveredWorkflow[]> {
    const workflows: DiscoveredWorkflow[] = [];
    const url = page.url();

    // Detect page type
    const pageInfo = await page.evaluate(() => {
      const bodyText = document.body.textContent?.toLowerCase() || '';
      const title = document.title.toLowerCase();

      return {
        isLandingPage: bodyText.length < 500 && document.querySelectorAll('a[href]').length < 10,
        isLoginPage: /login|sign.?in|log.?in/.test(bodyText) && document.querySelectorAll('form').length > 0,
        isSignupPage: /sign.?up|register|create account|get started/.test(bodyText),
        isSearchResults: document.querySelectorAll('[class*="result"], [class*="search-result"]').length > 5,
        isProductPage: /price|add to cart|buy now|product/i.test(bodyText),
        isCartPage: /cart|shopping cart|checkout/i.test(title),
        isCheckoutPage: /checkout|payment|shipping|billing/i.test(title),
        isDashboard: /dashboard|admin|analytics/i.test(title),
        hasPagination: !!document.querySelector('[class*="pagination"], nav[aria-label*="page"]'),
        hasSearch: !!document.querySelector('input[type="search"], [role="search"], input[name*="search"]'),
      };
    });

    // Login/Signup workflow
    if (pageInfo.isLoginPage) {
      workflows.push(this.buildLoginWorkflow(url, elements));
    }

    if (pageInfo.isSignupPage) {
      workflows.push(this.buildSignupWorkflow(url, elements));
    }

    // Search workflow
    if (pageInfo.hasSearch) {
      workflows.push(this.buildSearchWorkflow(url, elements));
    }

    // Search results workflow
    if (pageInfo.isSearchResults) {
      workflows.push(this.buildSearchResultsWorkflow(url, elements));
    }

    // E-commerce workflows
    if (pageInfo.isProductPage) {
      workflows.push(this.buildProductWorkflow(url, elements));
    }

    if (pageInfo.isCartPage || pageInfo.isCheckoutPage) {
      workflows.push(this.buildCheckoutWorkflow(url, elements));
    }

    // Dashboard workflows
    if (pageInfo.isDashboard) {
      workflows.push(this.buildDashboardWorkflow(url, elements));
    }

    // Generic multi-step form (wizard) detection
    const formWorkflows = await this.detectWizardForms(page, url);
    workflows.push(...formWorkflows);

    // Navigation structure workflow
    const navWorkflow = await this.buildNavigationWorkflow(page, url, elements);
    if (navWorkflow) workflows.push(navWorkflow);

    return workflows;
  }

  private buildLoginWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const inputs = elements.filter(e => e.elementType === 'input');
    const submitBtn = elements.find(e =>
      e.elementType === 'submit' || e.elementType === 'button'
    );

    const steps: WorkflowStep[] = [
      { order: 1, action: 'navigate', targetSelector: url, description: 'Open login page' },
    ];

    // Add input steps
    for (let i = 0; i < inputs.length; i++) {
      steps.push({
        order: steps.length + 1,
        action: 'type',
        targetSelector: inputs[i].selector,
        value: inputs[i].attributes.type === 'password' ? 'TestPass123!' : 'test@example.com',
        description: `Enter ${inputs[i].attributes.name || inputs[i].attributes.type}`,
      });
    }

    if (submitBtn) {
      steps.push({
        order: steps.length + 1,
        action: 'click',
        targetSelector: submitBtn.selector,
        description: 'Submit login form',
      });
    }

    return {
      id: 'workflow-login',
      name: 'Login Flow',
      steps,
      startUrl: url,
      description: 'User authentication login flow',
      estimatedDurationMs: steps.length * 1500,
    };
  }

  private buildSignupWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const inputs = elements.filter(e =>
      e.elementType === 'input' || e.elementType === 'select' || e.elementType === 'textarea'
    );
    const submitBtn = elements.find(e =>
      e.elementType === 'submit' || e.elementType === 'button'
    );

    const steps: WorkflowStep[] = [
      { order: 1, action: 'navigate', targetSelector: url, description: 'Open registration page' },
    ];

    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i];
      let value = 'TestUser';
      if (el.attributes.type === 'email') value = 'newuser@example.com';
      if (el.attributes.type === 'password') value = 'SecureP@ss1';
      if (el.attributes.type === 'tel') value = '+15551234567';

      steps.push({
        order: steps.length + 1,
        action: el.elementType === 'select' ? 'select' : 'type',
        targetSelector: el.selector,
        value,
        description: `Fill ${el.attributes.name || 'field'}`,
      });
    }

    if (submitBtn) {
      steps.push({
        order: steps.length + 1,
        action: 'click',
        targetSelector: submitBtn.selector,
        description: 'Submit registration',
      });
    }

    return {
      id: 'workflow-signup',
      name: 'Registration Flow',
      steps,
      startUrl: url,
      description: 'New user registration flow',
      estimatedDurationMs: steps.length * 1500,
    };
  }

  private buildSearchWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const searchInput = elements.find(e =>
      e.elementType === 'input' &&
      /search|find|query/i.test(e.attributes.name || e.attributes.placeholder || '')
    );

    return {
      id: 'workflow-search',
      name: 'Search Flow',
      steps: [
        { order: 1, action: 'navigate', targetSelector: url, description: 'Open site' },
        { order: 2, action: 'click', targetSelector: searchInput?.selector || 'input[type="search"]', description: 'Focus search input' },
        { order: 3, action: 'type', targetSelector: searchInput?.selector || 'input[type="search"]', value: 'test query', description: 'Enter search terms' },
        { order: 4, action: 'pressKey', targetSelector: searchInput?.selector || 'input[type="search"]', value: 'Enter', description: 'Execute search' },
        { order: 5, action: 'waitForNavigation', description: 'Wait for search results' },
      ],
      startUrl: url,
      description: 'Search and view results flow',
      estimatedDurationMs: 5000,
    };
  }

  private buildSearchResultsWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const resultLinks = elements.filter(e =>
      e.elementType === 'link' && !e.attributes.href?.startsWith('#')
    );

    return {
      id: 'workflow-search-results',
      name: 'Search Results → Detail',
      steps: [
        { order: 1, action: 'navigate', targetSelector: url, description: 'View search results page' },
        {
          order: 2,
          action: 'click',
          targetSelector: resultLinks[0]?.selector || 'a[href]:not([href="#"])',
          description: 'Click first search result',
        },
        { order: 3, action: 'waitForNavigation', description: 'Wait for detail page' },
      ],
      startUrl: url,
      description: 'Navigate from search results to detail page',
      estimatedDurationMs: 4000,
    };
  }

  private buildProductWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const addToCartBtn = elements.find(e =>
      /add to cart|buy|purchase/i.test(e.text)
    );

    const steps: WorkflowStep[] = [
      { order: 1, action: 'navigate', targetSelector: url, description: 'View product page' },
    ];

    // Check for size/color/variant selectors
    const selects = elements.filter(e => e.elementType === 'select');
    for (const sel of selects) {
      steps.push({
        order: steps.length + 1,
        action: 'select',
        targetSelector: sel.selector,
        value: 'first',
        description: `Select ${sel.attributes.name || 'option'}`,
      });
    }

    if (addToCartBtn) {
      steps.push({
        order: steps.length + 1,
        action: 'click',
        targetSelector: addToCartBtn.selector,
        description: 'Add product to cart',
      });
    }

    return {
      id: 'workflow-product',
      name: 'Product Purchase Flow',
      steps,
      startUrl: url,
      description: 'View product and add to cart',
      estimatedDurationMs: steps.length * 2000,
    };
  }

  private buildCheckoutWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const inputs = elements.filter(e =>
      e.elementType === 'input' || e.elementType === 'select'
    );
    const submitBtn = elements.find(e => /submit|place order|pay|continue/i.test(e.text));

    const steps: WorkflowStep[] = [
      { order: 1, action: 'navigate', targetSelector: url, description: 'Open checkout/cart page' },
    ];

    for (let i = 0; i < Math.min(inputs.length, 10); i++) {
      steps.push({
        order: steps.length + 1,
        action: inputs[i].elementType === 'select' ? 'select' : 'type',
        targetSelector: inputs[i].selector,
        value: inputs[i].elementType === 'select' ? 'first' : 'Test',
        description: `Fill ${inputs[i].attributes.name || 'field'}`,
      });
    }

    if (submitBtn) {
      steps.push({
        order: steps.length + 1,
        action: 'click',
        targetSelector: submitBtn.selector,
        description: 'Proceed with order',
      });
    }

    return {
      id: 'workflow-checkout',
      name: 'Checkout Flow',
      steps,
      startUrl: url,
      description: 'Complete checkout/purchase flow',
      estimatedDurationMs: steps.length * 2000,
    };
  }

  private buildDashboardWorkflow(url: string, elements: InteractiveElement[]): DiscoveredWorkflow {
    const navLinks = elements.filter(e =>
      e.elementType === 'nav-link' || e.elementType === 'link'
    );

    return {
      id: 'workflow-dashboard',
      name: 'Dashboard Navigation Flow',
      steps: [
        { order: 1, action: 'navigate', targetSelector: url, description: 'Open dashboard' },
        ...navLinks.slice(0, 5).map((link, i) => ({
          order: i + 2,
          action: 'click' as const,
          targetSelector: link.selector,
          description: `Navigate to ${link.text || link.selector}`,
        })),
      ],
      startUrl: url,
      description: 'Navigate through dashboard sections',
      estimatedDurationMs: 3000 + navLinks.slice(0, 5).length * 1000,
    };
  }

  /**
   * Detect multi-step/wizard forms
   */
  private async detectWizardForms(page: Page, url: string): Promise<DiscoveredWorkflow[]> {
    return page.evaluate((pageUrl) => {
      const workflowGuesses: any[] = [];

      // Check for step indicators
      const stepIndicators = document.querySelectorAll(
        '[class*="step"], [class*="wizard"], [class*="progress-step"], [aria-current="step"]'
      );

      if (stepIndicators.length >= 2) {
        let stepCount = stepIndicators.length;
        let currentStep = 0;
        stepIndicators.forEach((el, i) => {
          if (el.getAttribute('aria-current') === 'step' ||
              el.classList.contains('active') ||
              el.classList.contains('current')) {
            currentStep = i + 1;
          }
        });

        workflowGuesses.push({
          id: 'workflow-wizard',
          name: 'Multi-Step Wizard',
          steps: Array.from({ length: stepCount }, (_, i) => ({
            order: i + 1,
            action: 'click',
            targetSelector: `Step ${i + 1}`,
            description: `Complete wizard step ${i + 1}`,
          })),
          startUrl: pageUrl,
          description: `Multi-step form wizard (${stepCount} steps detected)`,
          estimatedDurationMs: stepCount * 5000,
        });
      }

      // Check for tabbed forms
      const tabs = document.querySelectorAll('[role="tab"]');
      if (tabs.length >= 2) {
        workflowGuesses.push({
          id: 'workflow-tabs',
          name: 'Tabbed Form Navigation',
          steps: Array.from(tabs).map((tab, i) => ({
            order: i + 1,
            action: 'click',
            targetSelector: `[role="tab"]:nth-child(${i + 1})`,
            description: `Switch to tab: ${tab.textContent?.trim() || `Tab ${i + 1}`}`,
          })),
          startUrl: pageUrl,
          description: `Navigate through ${tabs.length} form tabs`,
          estimatedDurationMs: tabs.length * 2000,
        });
      }

      return workflowGuesses;
    }, url);
  }

  /**
   * Build navigation structure workflow
   */
  private async buildNavigationWorkflow(
    page: Page,
    url: string,
    elements: InteractiveElement[],
  ): Promise<DiscoveredWorkflow | null> {
    const navLinks = await page.evaluate(() => {
      const nav = document.querySelector('nav, [role="navigation"], .navbar, .nav, .menu');
      if (!nav) return [];

      return Array.from(nav.querySelectorAll('a[href]')).map(a => ({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
      })).filter(l => l.href && !l.href.startsWith('#') && !l.href.startsWith('javascript:'));
    });

    if (navLinks.length === 0) return null;

    return {
      id: 'workflow-navigation',
      name: 'Navigation Flow',
      steps: [
        { order: 1, action: 'navigate', targetSelector: url, description: 'Open site' },
        ...navLinks.slice(0, 8).map((link, i) => ({
          order: i + 2,
          action: 'click' as const,
          targetSelector: `a:has-text("${link.text}")`,
          description: `Navigate to "${link.text}"`,
        })),
      ],
      startUrl: url,
      description: `Navigate through main navigation (${navLinks.length} links discovered)`,
      estimatedDurationMs: 2000 + navLinks.slice(0, 8).length * 1000,
    };
  }
}
