import { getInertRegistry } from '@texuli/core/inert';
import { afterEach, describe, expect, it } from 'vitest';
import { installPopoverOrder } from '../src/components/overlay/popover-order.ts';

/**
 * Texuli 0.5.0 re-shows inert exemptions (the dialog backdrop among them) when
 * an overlay opens, so a Select opened inside a dialog ended up under the
 * backdrop (gap N30). jsdom has no popover API: these stubs record the order
 * popovers are re-shown in, which is the top-layer order.
 */
const open = new Set<HTMLElement>();
const shown: string[] = [];
const releases: (() => void)[] = [];
let uninstall: () => void = () => {};

function popover(name: string, parent: HTMLElement = document.body): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute('popover', 'manual');
  element.dataset.name = name;
  const matches = element.matches.bind(element);
  Object.defineProperty(element, 'matches', {
    value: (selector: string) =>
      selector === ':popover-open' ? open.has(element) : matches(selector),
  });
  element.showPopover = () => {
    open.add(element);
    shown.push(name);
  };
  element.hidePopover = () => {
    open.delete(element);
  };
  parent.append(element);
  return element;
}

function exempt(element: HTMLElement, label: string): void {
  releases.push(getInertRegistry().exempt({ element, label }).release);
}

function opened(element: HTMLElement): void {
  element.showPopover();
  element.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
}

afterEach(() => {
  uninstall();
  for (const release of releases.splice(0)) release();
  open.clear();
  shown.length = 0;
  document.body.replaceChildren();
});

describe('installPopoverOrder (Texuli gap N30)', () => {
  it('re-shows the dialog, then the popover opened in it, then the toast region', () => {
    uninstall = installPopoverOrder(document);
    const toaster = popover('toaster');
    exempt(toaster, 'toast-region');
    const backdrop = popover('backdrop');
    exempt(backdrop, 'dialog-backdrop');
    const dialog = popover('dialog');
    const select = popover('select', dialog);
    // Texuli registers the Select content as an exemption too: it must still be re-ordered.
    exempt(select, 'select');
    for (const element of [toaster, backdrop, dialog]) element.showPopover();

    shown.length = 0;
    select.showPopover();
    backdrop.showPopover(); // what raiseExemptPopovers does
    shown.length = 0;
    select.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    expect(shown).toEqual(['dialog', 'select', 'toaster']);
  });

  it('does nothing while no backdrop is open, and never re-orders around backdrops', () => {
    uninstall = installPopoverOrder(document);
    const backdrop = popover('backdrop');
    exempt(backdrop, 'dialog-backdrop');
    const menu = popover('menu');
    opened(menu);
    expect(shown).toEqual(['menu']);

    backdrop.showPopover();
    shown.length = 0;
    backdrop.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    expect(shown).toEqual([]);
  });

  it('skips the toggle events its own re-shows queue', () => {
    uninstall = installPopoverOrder(document);
    const backdrop = popover('backdrop');
    exempt(backdrop, 'dialog-backdrop');
    backdrop.showPopover();
    const dialog = popover('dialog');
    dialog.showPopover();
    const select = popover('select', dialog);
    opened(select);
    shown.length = 0;
    // The re-shown dialog's queued toggle event arrives: no second round.
    dialog.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
    expect(shown).toEqual([]);
  });
});
