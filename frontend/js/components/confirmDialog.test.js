import { describe, it, expect } from 'vitest';
import { dialogBodyHtml } from './confirmDialog.js';

describe('dialogBodyHtml', () => {
  it('plain string lines stay as before (Phase 4/7 dialogs unchanged)', () => {
    expect(dialogBodyHtml({ lines: ['Datei: a.jpg', 'Wird endgültig gelöscht.'] })).toBe(
      '<p class="dialog__line">Datei: a.jpg</p><p class="dialog__line">Wird endgültig gelöscht.</p>',
    );
  });

  it('warn lines get the red modifier; every text is escaped', () => {
    const html = dialogBodyHtml({ lines: [{ text: '≠ 100 g <b>', warn: true }] });
    expect(html).toBe('<p class="dialog__line dialog__line--warn">≠ 100 g &lt;b&gt;</p>');
  });

  it('table sits between lines and notes in a scroll box; columns after the first are numeric; cells escaped', () => {
    const html = dialogBodyHtml({
      lines: ['vor'],
      table: { head: ['Wert', 'bisher', 'neu'], rows: [['JOD<', '3.8', '25.7']] },
      notes: ['nach'],
    });
    expect(html.indexOf('vor')).toBeLessThan(html.indexOf('dialog__scroll'));
    expect(html.indexOf('dialog__scroll')).toBeLessThan(html.indexOf('nach'));
    expect(html).toContain('<th>Wert</th><th class="num">bisher</th><th class="num">neu</th>');
    expect(html).toContain('<td>JOD&lt;</td><td class="num">3.8</td><td class="num">25.7</td>');
  });

  it('no table -> no scroll box', () => {
    expect(dialogBodyHtml({ lines: ['x'], table: null })).not.toContain('dialog__scroll');
  });
});
