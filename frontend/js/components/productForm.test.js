import { describe, it, expect, vi } from 'vitest';
import { renderProductForm, applyFormErrors } from './productForm.js';
import { emptyProductForm } from '../utils/productForm.js';
import { PRODUCT_INFO_FIELDS } from '../utils/productFields.js';

const ITEMARTS = ['A', 'L', 'M', 'N', 'R', 'S', 'V'];

/** Container-Attrappe ohne DOM: je Feld ein Wrapper mit .input (classList) und .field__error. */
function fakeContainer() {
  const wraps = {};
  for (const field of PRODUCT_INFO_FIELDS) {
    const classes = new Set();
    const input = { classes, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
    const error = { textContent: '', hidden: true };
    wraps[field.key] = { input, error, querySelector: (s) => (s === '.input' ? input : error) };
  }
  return {
    innerHTML: '',
    wraps,
    querySelector: (s) => wraps[/data-field="(\w+)"/.exec(s)[1]] ?? null,
  };
}

const eventOn = (el) => ({ target: { closest: () => el } });

function render(props = {}, handlers = {}) {
  const container = fakeContainer();
  const onChange = vi.fn();
  const onLmcBlur = vi.fn();
  renderProductForm(
    container,
    { form: emptyProductForm('2026-10-06'), itemarts: ITEMARTS, ...props },
    { onChange, onLmcBlur, ...handlers },
  );
  return { container, onChange, onLmcBlur };
}

describe('renderProductForm — markup', () => {
  it('draws 13 fields with German labels, required markers, select for Itemart, date input and defaults', () => {
    const { container } = render();
    const html = container.innerHTML;
    expect(html.match(/class="field"/g)).toHaveLength(13);
    expect(html).toContain('LMC *');
    expect(html).toContain('Bezeichnung *');
    expect(html).toContain('Marke</span>');
    expect(html).toContain('<select class="input" name="lebtab_Itemart">');
    expect(html).toContain('<option value="V" selected>V</option>');
    expect(html).toContain('type="date" name="lebtab_Datum" value="2026-10-06"');
    expect(html).toContain('name="lebtab_aktuell" value="1"');
    expect(html).toContain('name="lebtab_lmc" value="" maxlength="6"');
    expect(html).toContain('inputmode="numeric" name="lebtab_Version" value=""');
    expect(html).toContain('maxlength="255"');
  });
  it('escapes values and marks the LMC field readonly on request', () => {
    const form = { ...emptyProductForm('2026-10-06'), lebtab_Bezeich: '<b>"Käse"</b>', lebtab_lmc: 'A1CK00' };
    const { container } = render({ form, lmcReadonly: true });
    expect(container.innerHTML).toContain('value="&lt;b&gt;&quot;Käse&quot;&lt;/b&gt;"');
    expect(container.innerHTML).not.toContain('<b>"Käse"</b>');
    expect(container.innerHTML).toMatch(/name="lebtab_lmc" value="A1CK00"[^>]*readonly/);
  });
  it('keeps a form value outside the itemart list selectable', () => {
    const { container } = render({ form: { ...emptyProductForm('2026-10-06'), lebtab_Itemart: 'X' } });
    expect(container.innerHTML).toContain('<option value="X" selected>X</option>');
  });
});

describe('renderProductForm — events', () => {
  it('reports every input via onChange; LMC is uppercased', () => {
    const { container, onChange } = render();
    container.oninput(eventOn({ name: 'lebtab_Bezeich', value: 'Brot' }));
    container.oninput(eventOn({ name: 'lebtab_lmc', value: 'ab12cd' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 'lebtab_Bezeich', 'Brot');
    expect(onChange).toHaveBeenNthCalledWith(2, 'lebtab_lmc', 'AB12CD');
  });
  it('calls onLmcBlur only when the LMC field was changed and left', () => {
    const { container, onChange, onLmcBlur } = render();
    container.onchange(eventOn({ name: 'lebtab_Marke', value: 'Milka' }));
    expect(onLmcBlur).not.toHaveBeenCalled();
    container.onchange(eventOn({ name: 'lebtab_lmc', value: 'zzt001' }));
    expect(onLmcBlur).toHaveBeenCalledWith('ZZT001');
    expect(onChange).not.toHaveBeenCalled(); // change meldet nicht erneut — oninput hat den Wert schon gemeldet
  });
  it('ignores events from elements without a name', () => {
    const { container, onChange } = render();
    container.oninput({ target: { closest: () => null } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('applyFormErrors', () => {
  it('marks fields with .is-invalid and shows the message without re-rendering; clears them again', () => {
    const { container } = render();
    const before = container.innerHTML;
    applyFormErrors(container, { lebtab_lmc: 'existiert bereits', lebtab_Bezeich: 'darf nicht leer sein' });
    expect(container.innerHTML).toBe(before);
    expect(container.wraps.lebtab_lmc.input.classes.has('is-invalid')).toBe(true);
    expect(container.wraps.lebtab_lmc.error).toEqual({ textContent: 'existiert bereits', hidden: false });
    expect(container.wraps.lebtab_Marke.input.classes.has('is-invalid')).toBe(false);
    expect(container.wraps.lebtab_Marke.error.hidden).toBe(true);
    applyFormErrors(container, {});
    expect(container.wraps.lebtab_lmc.input.classes.has('is-invalid')).toBe(false);
    expect(container.wraps.lebtab_lmc.error).toEqual({ textContent: '', hidden: true });
  });
});
