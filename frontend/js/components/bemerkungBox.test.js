import { describe, it, expect, vi } from 'vitest';
import { bemerkungHtml, bemerkungCountText, renderBemerkungBox, setBemerkungText } from './bemerkungBox.js';

/** Container-Attrappe ohne DOM: Teile per data-role. */
function fakeContainer() {
  const parts = {
    text: { value: '' },
    count: { textContent: '' },
    save: { disabled: false, classList: { toggle: vi.fn() } },
  };
  return {
    innerHTML: '',
    parts,
    querySelector: (s) => parts[/data-role="(\w+)"/.exec(s)?.[1]] ?? null,
  };
}
const eventOn = (role, value) => ({ target: { value, closest: (s) => (s === `[data-role="${role}"]` ? {} : null) } });

describe('bemerkungBox', () => {
  it('escapes the text inside the textarea and shows the counter in code points', () => {
    const html = bemerkungHtml({ text: '<b>€\nZeile', maxLength: 10000 });
    expect(html).toContain('&lt;b&gt;€\nZeile</textarea>');
    expect(html).toContain('Bemerkung speichern');
    expect(bemerkungCountText('€€', 10000)).toBe('2 / 10000 Zeichen');
  });

  it('readonly (no migration 001): textarea readonly, no button, hint', () => {
    const html = bemerkungHtml({ text: '', readonly: true, maxLength: 10000 });
    expect(html).toContain('readonly');
    expect(html).not.toContain('data-role="save"');
    expect(html).toContain('Datenbank-Migration 001');
  });

  it('typing updates only the counter; the save button hands the current text to onSave', () => {
    const c = fakeContainer();
    const onSave = vi.fn();
    renderBemerkungBox(c, { text: '', maxLength: 10 }, { onSave });
    c.oninput(eventOn('text', 'abc'));
    expect(c.parts.count.textContent).toBe('3 / 10 Zeichen');
    c.parts.text.value = 'Neu';
    c.onclick(eventOn('save'));
    c.onclick(eventOn('other'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Neu');
  });

  it('setBemerkungText puts the typed text back after a reload (conflict) and updates the counter', () => {
    const c = fakeContainer();
    setBemerkungText(c, 'mein Text', 100);
    expect(c.parts.text.value).toBe('mein Text');
    expect(c.parts.count.textContent).toBe('9 / 100 Zeichen');
  });
});
