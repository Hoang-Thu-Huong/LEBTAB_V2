import { describe, it, expect, vi } from 'vitest';
import { renderStaleBanner } from './staleBanner.js';

/** Container-Attrappe ohne DOM. */
const fakeContainer = () => ({ innerHTML: 'alt', hidden: false, onclick: null });
const clickOn = (selector) => ({ target: { closest: (s) => (s === selector ? {} : null) } });

describe('renderStaleBanner', () => {
  it('stale 0 -> hidden and empty', () => {
    const c = fakeContainer();
    renderStaleBanner(c, { stale: 0 });
    expect(c.hidden).toBe(true);
    expect(c.innerHTML).toBe('');
  });

  it('stale 1 -> warning text without a button (detail, Phase 7)', () => {
    const c = fakeContainer();
    renderStaleBanner(c, { stale: 1 });
    expect(c.hidden).toBe(false);
    expect(c.innerHTML).toContain('<strong>Nährwerte nicht aktuell</strong>');
    expect(c.innerHTML).toContain('Die Rezeptur wurde geändert; die gespeicherten 79 Nährwerte sind noch die alten.');
    expect(c.innerHTML).not.toContain('data-action="recalculate"');
  });

  it('canRecalculate (Phase 8) -> button "Neu berechnen & speichern" that fires onRecalculate; busy disables it', () => {
    const c = fakeContainer();
    const onRecalculate = vi.fn();
    renderStaleBanner(c, { stale: 1, canRecalculate: true }, { onRecalculate });
    expect(c.innerHTML).toContain('Neu berechnen &amp; speichern');
    c.onclick(clickOn('[data-action="recalculate"]'));
    c.onclick(clickOn('.other'));
    expect(onRecalculate).toHaveBeenCalledTimes(1);
    renderStaleBanner(c, { stale: 1, canRecalculate: true, busy: true }, { onRecalculate });
    expect(c.innerHTML).toContain('disabled');
  });
});
