import { describe, expect, it, vi } from 'vitest';
import { isolateFromAppLayers } from '../src/mount.ts';

describe('isolateFromAppLayers', () => {
  it('hides panel focus and clicks from an app focus trap and outside-dismiss listener', () => {
    const app = document.body.appendChild(document.createElement('button'));
    const host = document.body.appendChild(document.createElement('div'));
    const panelButton = host.appendChild(document.createElement('button'));
    const onHost = vi.fn();
    host.addEventListener('click', onHost);

    // Mimics a modal: capture-phase trap on document + bubble-phase outside dismissal.
    const trap = vi.fn((event: FocusEvent) => {
      if (event.target !== app) app.focus();
    });
    const dismiss = vi.fn();
    document.addEventListener('focusin', trap, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('click', dismiss);

    const release = isolateFromAppLayers(host);
    panelButton.focus();
    expect(document.activeElement).toBe(panelButton);
    expect(trap).not.toHaveBeenCalled();
    panelButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    panelButton.click();
    expect(dismiss).not.toHaveBeenCalled();
    expect(onHost).toHaveBeenCalledTimes(1);

    release();
    app.focus();
    panelButton.focus();
    expect(trap).toHaveBeenCalled();
    document.removeEventListener('focusin', trap, true);
    document.removeEventListener('pointerdown', dismiss);
    document.removeEventListener('click', dismiss);
    app.remove();
    host.remove();
  });
});
