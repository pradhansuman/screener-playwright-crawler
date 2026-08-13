// action-discovery.ts — Discover user actions and interaction patterns

import { Page } from 'playwright';
import { InteractiveElement, ElementType } from '../types';

export interface ActionPattern {
  type: 'click' | 'hover' | 'type' | 'select' | 'drag' | 'scroll' | 'keyboard';
  element: InteractiveElement;
  trigger: string;
  expectedBehavior: string;
  dependencies: string[];
}

/**
 * Discover all actionable patterns on a page.
 * Goes beyond selectors — identifies what the user CAN do.
 */
export class ActionDiscovery {
  /**
   * Discover actions on a page
   */
  async discover(page: Page, elements: InteractiveElement[]): Promise<ActionPattern[]> {
    const actions: ActionPattern[] = [];

    for (const el of elements) {
      actions.push(...this.getActionsForElement(el));
    }

    return actions;
  }

  /**
   * Determine possible actions for an element based on its type and attributes
   */
  private getActionsForElement(el: InteractiveElement): ActionPattern[] {
    const actions: ActionPattern[] = [];

    switch (el.elementType) {
      case 'button':
      case 'submit':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Click ${el.text || el.selector}`,
          expectedBehavior: el.attributes.type === 'submit'
            ? 'Submits the parent form'
            : 'Triggers the button action',
          dependencies: [],
        });

        // Check if button might have hover state
        if (el.aria.hasPopup) {
          actions.push({
            type: 'hover',
            element: el,
            trigger: `Hover on ${el.text || el.selector}`,
            expectedBehavior: `Opens ${el.aria.hasPopup} popup`,
            dependencies: [],
          });
        }
        break;

      case 'link':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Navigate via ${el.text || el.selector}`,
          expectedBehavior: el.attributes.href.startsWith('#')
            ? 'Scrolls to anchor or triggers client-side navigation'
            : `Navigates to ${el.attributes.href}`,
          dependencies: [],
        });
        break;

      case 'input':
        if (el.attributes.type === 'file') {
          actions.push({
            type: 'click',
            element: el,
            trigger: `Open file picker for ${el.attributes.name || el.selector}`,
            expectedBehavior: 'Opens OS file picker dialog',
            dependencies: [],
          });
        } else {
          actions.push({
            type: 'type',
            element: el,
            trigger: `Type into ${el.attributes.name || el.selector}`,
            expectedBehavior: 'Accepts text input',
            dependencies: [],
          });
        }
        break;

      case 'select':
        actions.push({
          type: 'select',
          element: el,
          trigger: `Select option in ${el.attributes.name || el.selector}`,
          expectedBehavior: 'Selects a value from dropdown',
          dependencies: [],
        });
        break;

      case 'checkbox':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Toggle ${el.text || el.attributes.name || el.selector}`,
          expectedBehavior: 'Toggles checkbox state',
          dependencies: [],
        });
        break;

      case 'radio':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Select radio ${el.text || el.attributes.name || el.selector}`,
          expectedBehavior: 'Selects this radio option, deselecting siblings',
          dependencies: [],
        });
        break;

      case 'textarea':
        actions.push({
          type: 'type',
          element: el,
          trigger: `Type into ${el.attributes.name || el.selector}`,
          expectedBehavior: 'Accepts multi-line text input',
          dependencies: [],
        });
        break;

      case 'nav-link':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Navigate to section via ${el.text || el.selector}`,
          expectedBehavior: 'Navigates or scrolls to target section',
          dependencies: [],
        });
        break;

      case 'tab':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Switch to tab ${el.text || el.selector}`,
          expectedBehavior: 'Shows tab panel content',
          dependencies: [],
        });
        break;

      case 'accordion':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Toggle accordion ${el.text || el.selector}`,
          expectedBehavior: 'Expands or collapses content panel',
          dependencies: [],
        });
        break;

      case 'modal-trigger':
        actions.push({
          type: 'click',
          element: el,
          trigger: `Open modal via ${el.text || el.selector}`,
          expectedBehavior: 'Opens modal dialog',
          dependencies: [],
        });
        break;

      case 'drag-handle':
        actions.push({
          type: 'drag',
          element: el,
          trigger: `Drag ${el.text || el.selector}`,
          expectedBehavior: 'Performs drag-and-drop reordering or resize',
          dependencies: [],
        });
        break;

      default:
        // For unknown types, try click if it looks interactive
        if (el.isVisible && el.isEnabled) {
          actions.push({
            type: 'click',
            element: el,
            trigger: `Interact with ${el.text || el.selector}`,
            expectedBehavior: 'Triggers element interaction',
            dependencies: [],
          });
        }
    }

    return actions;
  }

  /**
   * Discover keyboard-navigable elements
   */
  async discoverKeyboardActions(page: Page): Promise<Array<{ key: string; selector: string; description: string }>> {
    return page.evaluate(() => {
      const actions: Array<{ key: string; selector: string; description: string }> = [];

      // Escape — close modals
      const modals = document.querySelectorAll('[role="dialog"], .modal, [aria-modal="true"]');
      if (modals.length > 0) {
        actions.push({ key: 'Escape', selector: modals[0].tagName, description: 'Close active modal/dialog' });
      }

      // Enter on focused elements
      const focusable = document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        actions.push({
          key: 'Enter',
          selector: 'any-focusable',
          description: `Activate focused element (${focusable.length} focusable elements found)`,
        });
        actions.push({
          key: 'Tab',
          selector: 'any-focusable',
          description: 'Navigate to next focusable element',
        });
      }

      return actions;
    });
  }
}
