import { describe, it, expect, vi } from 'vitest';
import {
  renderIngredientPicker,
  renderPickerResults,
  showPickerMessage,
  clearPicker,
  MIN_TERM_LENGTH,
} from './ingredientPicker.js';

/** Container-Attrappe ohne DOM: Suchfeld, Meldungszeile und Trefferbox als Objekte. */
function fakeContainer() {
  const input = { value: 'Milch' };
  const message = { textContent: '', hidden: true };
  const results = { innerHTML: '' };
  const parts = { '.picker__input': input, '.picker__message': message, '.picker__results': results };
  return { innerHTML: '', input, message, results, querySelector: (s) => parts[s] };
}

const eventOn = (selector, element) => ({
  target: { closest: (candidate) => (candidate === selector ? element : null), value: element?.value },
});

const ITEMS = [
  { lebtab_lmc: 'AFB000', lebtab_Bezeich: 'Butter <süß>', lebtab_Itemart: 'L' },
  { lebtab_lmc: 'JVB100', lebtab_Bezeich: 'Vitamin B1 (1=1ug)', lebtab_Itemart: 'A' },
];

function render() {
  const container = fakeContainer();
  const onSearch = vi.fn();
  const onPick = vi.fn();
  renderIngredientPicker(container, {}, { onSearch, onPick });
  return { container, onSearch, onPick };
}

describe('MIN_TERM_LENGTH', () => {
  it('is exported so the page and the placeholder text cannot drift apart', () => {
    expect(MIN_TERM_LENGTH).toBe(2);
  });
});

describe('renderIngredientPicker', () => {
  it('draws the search field and reports input via onSearch', () => {
    const { container, onSearch } = render();
    expect(container.innerHTML).toContain('Zutat suchen (Bezeichnung oder LMC)');
    expect(container.innerHTML).toContain('class="input picker__input"');
    container.oninput(eventOn('.picker__input', { value: 'Mil' }));
    expect(onSearch).toHaveBeenCalledWith('Mil');
  });
  it('reports a clicked result via onPick with the data attributes of the button', () => {
    const { container, onPick } = render();
    const button = { dataset: { lmc: 'AFB000', bezeich: 'Butter', itemart: 'L' } };
    container.onclick(eventOn('.picker__item', button));
    expect(onPick).toHaveBeenCalledWith({ lebtab_lmc: 'AFB000', lebtab_Bezeich: 'Butter', lebtab_Itemart: 'L' });
    container.onclick(eventOn('.other', {}));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('renderPickerResults', () => {
  it('renders one button per item with code, escaped name and Itemart tag (A = Zusatz)', () => {
    const { container } = render();
    renderPickerResults(container, { status: 'done', items: ITEMS, total: 2 });
    const html = container.results.innerHTML;
    expect(html.match(/class="picker__item"/g)).toHaveLength(2);
    expect(html).toContain('data-lmc="AFB000"');
    expect(html).toContain('Butter &lt;süß&gt;');
    expect(html).not.toContain('<süß>');
    expect(html).toContain('<span class="tag">Zusatz</span>');
    expect(html).toContain('<span class="tag">L</span>');
    expect(html).not.toContain('Weitere Treffer');
    expect(container.innerHTML).toContain('picker__input'); // Suchfeld wurde nicht neu gezeichnet
  });
  it('shows the status texts: hint, loading, no hits, error, more hits', () => {
    const { container } = render();
    renderPickerResults(container, { status: 'hint' });
    expect(container.results.innerHTML).toContain('Mindestens 2 Zeichen eingeben');
    renderPickerResults(container, { status: 'loading' });
    expect(container.results.innerHTML).toContain('Suche …');
    renderPickerResults(container, { status: 'done', items: [], total: 0 });
    expect(container.results.innerHTML).toContain('Keine Treffer');
    renderPickerResults(container, { status: 'error', error: { message: 'Datenbank nicht erreichbar' } });
    expect(container.results.innerHTML).toContain('Datenbank nicht erreichbar');
    renderPickerResults(container, { status: 'done', items: ITEMS, total: 37 });
    expect(container.results.innerHTML).toContain('Weitere Treffer – Suche verfeinern');
    renderPickerResults(container, { status: 'idle' });
    expect(container.results.innerHTML).toBe('');
  });
});

describe('showPickerMessage / clearPicker', () => {
  it('shows and hides the red line; clearPicker empties field and results', () => {
    const { container } = render();
    showPickerMessage(container, 'AFB000 ist bereits in der Zutatenliste');
    expect(container.message).toEqual({ textContent: 'AFB000 ist bereits in der Zutatenliste', hidden: false });
    showPickerMessage(container, null);
    expect(container.message).toEqual({ textContent: '', hidden: true });
    renderPickerResults(container, { status: 'done', items: ITEMS, total: 2 });
    clearPicker(container);
    expect(container.input.value).toBe('');
    expect(container.results.innerHTML).toBe('');
  });
});
