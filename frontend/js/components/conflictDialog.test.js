import { describe, it, expect } from 'vitest';
import { conflictDialogLines } from './conflictDialog.js';

const INTRO = { text: 'Das Produkt wurde inzwischen von jemand anderem geändert.', warn: true };

describe('conflictDialogLines', () => {
  it("'form': input in the form is lost on reload (ARCH 7.5)", () => {
    expect(conflictDialogLines({ kind: 'form' })).toEqual([
      INTRO,
      'Neu laden: die aktuellen Stammdaten werden geladen — Ihre Eingaben in diesem Formular gehen verloren.',
      'Abbrechen: nichts wird gespeichert.',
    ]);
  });

  it("'recalc': nothing saved, recalculate again after reloading", () => {
    expect(conflictDialogLines({ kind: 'recalc' })[1]).toBe(
      'Neu laden: die Seite zeigt den aktuellen Stand; danach bitte erneut „Neu berechnen & speichern“.',
    );
  });

  it("'recalc' with unsaved Stammdaten: warns in red that the form input is lost on reload", () => {
    expect(conflictDialogLines({ kind: 'recalc', unsavedForm: true })).toEqual([
      INTRO,
      'Neu laden: die Seite zeigt den aktuellen Stand; danach bitte erneut „Neu berechnen & speichern“.',
      { text: 'Ihre ungespeicherten Änderungen an den Stammdaten gehen dabei verloren.', warn: true },
      'Abbrechen: nichts wird gespeichert.',
    ]);
    expect(conflictDialogLines({ kind: 'recalc', unsavedForm: false })).toHaveLength(3);
  });

  it("'bemerkung': shows the note saved by the other person and promises to keep the typed text", () => {
    expect(conflictDialogLines({ kind: 'bemerkung', current: { lebtab_bemerkung: 'Von B\nZeile 2' } })).toEqual([
      INTRO,
      'Gespeicherte Bemerkung jetzt:',
      'Von B\nZeile 2',
      'Neu laden: die Seite wird aktualisiert, Ihr eingegebener Text bleibt im Feld erhalten.',
      'Abbrechen: nichts wird gespeichert.',
    ]);
    expect(conflictDialogLines({ kind: 'bemerkung', current: { lebtab_bemerkung: null } })[2]).toBe('(leer)');
  });
});
