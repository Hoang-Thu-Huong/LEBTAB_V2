import { describe, it, expect, vi } from 'vitest';
import { renderIngredientTable, updateIngredientSum, setIngredientRowError } from './ingredientTable.js';

const dbRow = (id, LM_Zutat, Menge, itemart) => ({
  id, LMC: 'P00001', LM_Zutat, Menge, Version: 3, Anrcode: 0,
  zutat: itemart === null ? null : { lebtab_Bezeich: `Zutat ${id}`, lebtab_Itemart: itemart },
});
const localRow = (tmpId, LM_Zutat, mengeText, Menge, itemart = 'L') => ({
  tmpId, LM_Zutat, mengeText, Menge, zutat: { lebtab_Bezeich: `Zutat <${tmpId}>`, lebtab_Itemart: itemart },
});

/** Container-Attrappe: merkt sich innerHTML; Summenzeile und Warnhinweis als Objekte fuer updateIngredientSum. */
function fakeContainer() {
  const sum = { textContent: '', classes: new Set() };
  sum.classList = { toggle: (c, on) => (on ? sum.classes.add(c) : sum.classes.delete(c)) };
  const warn = { hidden: true };
  const inputs = [];
  return { innerHTML: '', sum, warn, inputs, querySelector: (s) => (s === '#menge-sum' ? sum : warn), querySelectorAll: () => inputs };
}
/** Menge-Eingabefeld-Attrappe fuer updateIngredientSum (classList.toggle wie im DOM). */
function fakeMengeInput(tmpId) {
  const classes = new Set();
  return { dataset: { tmpId: String(tmpId) }, classes, classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } };
}

const eventOn = (selector, element) => ({
  target: { closest: (candidate) => (candidate === selector ? element : null) },
});

describe('renderIngredientTable — readonly (unchanged since phase 2)', () => {
  it('hides Menge 0 rows, shows the hint, sums without Zusatz, links known codes', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows: [dbRow(1, 'L00001', 60, 'L'), dbRow(2, 'X00001', 40, null), dbRow(3, 'JVB100', 210, 'A'), dbRow(4, 'L00004', 0, 'L')] });
    expect(c.innerHTML).toContain('1 Zeile mit Menge 0 ausgeblendet');
    expect(c.innerHTML).toContain('<strong id="menge-sum" class="">100 g</strong>');
    expect(c.innerHTML).toContain('href="detail.html?lmc=L00001"');
    expect(c.innerHTML).toContain('unbekannt');
    expect(c.innerHTML).toContain('>Zusatz<');
    expect(c.innerHTML).not.toContain('L00004');
  });
  it('shows the empty hint without a sum, and the red sum when != 100', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows: [] });
    expect(c.innerHTML).toContain('Keine Rezeptur hinterlegt.');
    expect(c.innerHTML).not.toContain('menge-sum');
    renderIngredientTable(c, { rows: [dbRow(1, 'L00001', 80, 'L')], mode: 'readonly' });
    expect(c.innerHTML).toContain('class="sum-warn">80 g</strong> <span class="sum-warn">≠ 100 g</span>');
  });
});

describe('renderIngredientTable — local (create)', () => {
  const rows = [localRow(1, 'L00001', '60', 60), localRow(2, 'L00002', '', null), localRow(3, 'JVB100', '0', 0, 'A')];

  it('renders every row (also Menge 0) with a Menge input, remove button and escaped name; empty Menge counts as 0', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'local' }, { onMengeInput: vi.fn(), onRemove: vi.fn() });
    expect(c.innerHTML.match(/class="input input--menge/g)).toHaveLength(3);
    expect(c.innerHTML).toContain('inputmode="decimal"');
    expect(c.innerHTML).toContain('data-tmp-id="2" value=""');
    expect(c.innerHTML).toContain('Zutat &lt;1&gt;');
    expect(c.innerHTML.match(/data-action="remove"/g)).toHaveLength(3);
    expect(c.innerHTML).toContain('<strong id="menge-sum" class="sum-warn">60 g</strong>');
    expect(c.innerHTML).toContain('class="sum-warn sum-warn-note" >≠ 100 g');
    expect(c.innerHTML).not.toContain('ausgeblendet');
  });
  it('shows the empty-recipe note of the form', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows: [], mode: 'local' }, {});
    expect(c.innerHTML).toContain('Noch keine Zutaten ausgewählt.');
    expect(c.innerHTML).toContain('Ohne Zutaten bleiben alle Nährwerte leer.');
  });
  it('marks a row error and reports input/remove via handlers', () => {
    const c = fakeContainer();
    const onMengeInput = vi.fn();
    const onRemove = vi.fn();
    renderIngredientTable(c, { rows, mode: 'local', errors: { 2: 'Menge fehlt' } }, { onMengeInput, onRemove });
    expect(c.innerHTML).toContain('is-invalid" type="text" inputmode="decimal"\n        data-tmp-id="2"');
    expect(c.innerHTML).toContain('<span class="field__error" >Menge fehlt</span>');
    const input = { dataset: { tmpId: '2' }, value: '12,5', classList: { remove: vi.fn() } };
    c.oninput(eventOn('.input--menge', input));
    expect(onMengeInput).toHaveBeenCalledWith(2, '12,5');
    expect(input.classList.remove).toHaveBeenCalledWith('is-invalid');
    c.onclick(eventOn('[data-action="remove"]', { dataset: { tmpId: '3' } }));
    expect(onRemove).toHaveBeenCalledWith(3);
  });
  it('typing into a Menge cell clears that row error text without re-rendering', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'local', errors: { 2: 'Menge fehlt' } }, { onMengeInput: vi.fn(), onRemove: vi.fn() });
    const before = c.innerHTML;
    const note = { hidden: false, textContent: 'Menge fehlt' };
    const cell = { querySelector: (s) => (s === '.field__error' ? note : null) };
    const input = {
      dataset: { tmpId: '2' }, value: '5', classList: { remove: vi.fn() },
      closest: (s) => (s === 'td' ? cell : null),
    };
    c.oninput(eventOn('.input--menge', input));
    expect(input.classList.remove).toHaveBeenCalledWith('is-invalid');
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe('');
    expect(c.innerHTML).toBe(before);
  });
  it('marks a non-empty Menge that is not a number >= 0 as invalid immediately and keeps the sum red', () => {
    const c = fakeContainer();
    const bad = [localRow(1, 'L00001', '60', 60), localRow(2, 'L00002', 'abc', null), localRow(3, 'L00003', '40', 40)];
    renderIngredientTable(c, { rows: bad, mode: 'local' }, {});
    expect(c.innerHTML).toContain('is-invalid" type="text" inputmode="decimal"\n        data-tmp-id="2"');
    expect(c.innerHTML).not.toContain('is-invalid" type="text" inputmode="decimal"\n        data-tmp-id="1"');
    expect(c.innerHTML).toContain('<strong id="menge-sum" class="sum-warn">100 g</strong>'); // Summe stimmt, Zeile 2 nicht
    c.inputs.push(fakeMengeInput(1), fakeMengeInput(2));
    updateIngredientSum(c, bad);
    expect(c.inputs[1].classes.has('is-invalid')).toBe(true);
    expect(c.inputs[0].classes.has('is-invalid')).toBe(false);
    expect(c.sum.classes.has('sum-warn')).toBe(true);
    updateIngredientSum(c, [localRow(1, 'L00001', '60', 60), localRow(2, 'L00002', '40', 40)]);
    expect(c.inputs[1].classes.has('is-invalid')).toBe(false);
    expect(c.sum.classes.has('sum-warn')).toBe(false);
    updateIngredientSum(c, [localRow(1, 'L00001', '-5', -5), localRow(2, 'L00002', '105', 105)]);
    expect(c.inputs[0].classes.has('is-invalid')).toBe(true); // negativ zaehlt nicht als 0 g "ok"
    expect(c.sum.classes.has('sum-warn')).toBe(true);
  });
  it('updateIngredientSum changes only the sum line (no re-render), excluding Zusatz rows', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'local' }, {});
    const before = c.innerHTML;
    updateIngredientSum(c, [localRow(1, 'L00001', '60', 60), localRow(2, 'L00002', '40', 40), localRow(3, 'JVB100', '210', 210, 'A')]);
    expect(c.innerHTML).toBe(before);
    expect(c.sum.textContent).toBe('100 g');
    expect(c.sum.classes.has('sum-warn')).toBe(false);
    expect(c.warn.hidden).toBe(true);
    updateIngredientSum(c, [localRow(1, 'L00001', '99,99999999999999', 99.99999999999999)]);
    expect(c.sum.textContent).toBe('99.99999999999999 g'); // unveraendert, keine Rundung (DECISIONS #58)
    expect(c.sum.classes.has('sum-warn')).toBe(false); // innerhalb der Toleranz
    updateIngredientSum(c, [localRow(1, 'L00001', '80', 80)]);
    expect(c.sum.classes.has('sum-warn')).toBe(true);
    expect(c.warn.hidden).toBe(false);
  });
});

describe('renderIngredientTable — remote (edit, Phase 7)', () => {
  const remoteRow = (id, LM_Zutat, Menge, itemart, Anrcode = 0) => ({
    ...dbRow(id, LM_Zutat, Menge, itemart), Anrcode, mengeText: String(Menge),
  });
  const rows = [remoteRow(1, 'L00001', 60, 'L'), remoteRow(2, 'X00001', 0, null), remoteRow(3, 'JVB100', 210, 'A', 2)];

  it('renders every row (also Menge 0 and unknown) with Menge input keyed by id, Anrcode read-only, link for known codes', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'remote' }, { onMengeInput: vi.fn(), onMengeCommit: vi.fn(), onRemove: vi.fn() });
    expect(c.innerHTML.match(/class="input input--menge/g)).toHaveLength(3);
    expect(c.innerHTML).toContain('data-id="2" value="0"');
    expect(c.innerHTML).not.toContain('data-tmp-id');
    expect(c.innerHTML).toContain('href="detail.html?lmc=L00001"');
    expect(c.innerHTML).toContain('unbekannt');
    expect(c.innerHTML).toContain('<th class="num">Anrcode</th>');
    expect(c.innerHTML).toContain('<td class="num">2</td>');
    expect(c.innerHTML.match(/data-action="remove"/g)).toHaveLength(3);
    expect(c.innerHTML).toContain('<strong id="menge-sum" class="sum-warn">60 g</strong>'); // unbekannt zaehlt mit, Zusatz nicht
    expect(c.innerHTML).not.toContain('ausgeblendet');
  });

  it('canDelete false (no migration 002) -> no Entfernen button + hint; empty recipe -> hint to use the search', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'remote', canDelete: false }, {});
    expect(c.innerHTML).not.toContain('data-action="remove"');
    expect(c.innerHTML).toContain('Löschen von Zutaten erst nach Datenbank-Migration 002 möglich.');
    renderIngredientTable(c, { rows: [], mode: 'remote' }, {});
    expect(c.innerHTML).toContain('Keine Rezeptur hinterlegt.');
    expect(c.innerHTML).toContain('Zutaten über die Suche hinzufügen.');
    expect(c.innerHTML).not.toContain('menge-sum');
  });

  it('reports input (while typing), commit (change / Enter -> blur) and remove with the c_zutab id', () => {
    const c = fakeContainer();
    const onMengeInput = vi.fn();
    const onMengeCommit = vi.fn();
    const onRemove = vi.fn();
    renderIngredientTable(c, { rows, mode: 'remote' }, { onMengeInput, onMengeCommit, onRemove });
    const input = { dataset: { id: '2' }, value: '12,5', classList: { remove: vi.fn() } };
    c.oninput(eventOn('.input--menge', input));
    expect(onMengeInput).toHaveBeenCalledWith(2, '12,5');
    c.onchange(eventOn('.input--menge', input));
    expect(onMengeCommit).toHaveBeenCalledWith(2, '12,5');
    const blur = vi.fn();
    const preventDefault = vi.fn();
    c.onkeydown({ key: 'Enter', preventDefault, target: { closest: (s) => (s === '.input--menge' ? input : null), blur } });
    expect(blur).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    c.onclick(eventOn('[data-action="remove"]', { dataset: { id: '3' } }));
    expect(onRemove).toHaveBeenCalledWith(3);
  });

  it('setIngredientRowError marks one cell without re-rendering; updateIngredientSum works for remote rows', () => {
    const c = fakeContainer();
    renderIngredientTable(c, { rows, mode: 'remote' }, {});
    const before = c.innerHTML;
    const note = { textContent: '', hidden: true };
    const input = { classList: { toggle: vi.fn() }, parentElement: { querySelector: () => note } };
    const parts = { '.input--menge[data-id="2"]': input, '#menge-sum': c.sum, '.sum-warn-note': c.warn };
    c.querySelector = (s) => parts[s] ?? null;
    setIngredientRowError(c, 2, 'muss eine Zahl ≥ 0 sein');
    expect(input.classList.toggle).toHaveBeenCalledWith('is-invalid', true);
    expect(note).toEqual({ textContent: 'muss eine Zahl ≥ 0 sein', hidden: false });
    setIngredientRowError(c, 2, null);
    expect(note).toEqual({ textContent: '', hidden: true });
    setIngredientRowError(c, 99, 'x'); // unbekannte Zeile: kein Fehler
    expect(c.innerHTML).toBe(before);
    updateIngredientSum(c, [remoteRow(1, 'L00001', 40, 'L'), remoteRow(2, 'X00001', 60, null)]);
    expect(c.sum.textContent).toBe('100 g');
    expect(c.warn.hidden).toBe(true);
  });
});
