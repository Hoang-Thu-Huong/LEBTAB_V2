import { describe, it, expect } from 'vitest';
import { showError } from './message.js';

const fakeContainer = () => ({ className: '', innerHTML: '', hidden: true });

describe('showError', () => {
  it('shows a structured API error with its details', () => {
    const c = fakeContainer();
    showError(c, {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Ungültige Anfrageparameter',
      details: [{ field: 'datum_from', issue: 'darf nicht nach datum_to liegen' }],
    });
    expect(c.hidden).toBe(false);
    expect(c.className).toBe('message message--error');
    expect(c.innerHTML).toContain('<strong>Ungültige Anfrageparameter</strong>');
    expect(c.innerHTML).toContain('<span class="code">datum_from</span>: darf nicht nach datum_to liegen');
  });

  it('shows a plain { message } object created by a page unchanged', () => {
    const c = fakeContainer();
    showError(c, { message: 'Keine Produktnummer angegeben (?lmc= fehlt).' });
    expect(c.innerHTML).toBe('<strong>Keine Produktnummer angegeben (?lmc= fehlt).</strong>');
  });

  it('replaces a JS exception by a German text and keeps the technical message as small detail', () => {
    const c = fakeContainer();
    showError(c, new TypeError("Cannot read properties of undefined (reading 'map')"));
    expect(c.innerHTML).toContain('<strong>Unerwarteter Fehler. Bitte die Seite neu laden.</strong>');
    expect(c.innerHTML).toContain(
      '<div class="message__detail">TypeError: Cannot read properties of undefined (reading &#39;map&#39;)</div>',
    );
    expect(c.innerHTML).not.toContain('<strong>Cannot');
  });

  it('escapes HTML in the technical message', () => {
    const c = fakeContainer();
    showError(c, new Error('<img src=x onerror=alert(1)>'));
    expect(c.innerHTML).not.toContain('<img');
    expect(c.innerHTML).toContain('&lt;img');
  });
});
