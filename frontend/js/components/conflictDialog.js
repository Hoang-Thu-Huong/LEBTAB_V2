import { confirmDialog } from './confirmDialog.js';

/**
 * Dialog bei 409 VERSION_CONFLICT (docs/SPEC.md 5.6, docs/ARCHITECTURE.md 7.3/7.5): "Neu laden" | "Abbrechen".
 * Was beim Neuladen mit der Eingabe passiert, haengt von der Stelle ab:
 *   'form'       Stammdaten auf edit.html — Eingaben gehen verloren (7.5)
 *   'recalc'     "Neu berechnen & speichern" — nichts gespeichert, danach erneut berechnen
 *   'bemerkung'  detail.html — der getippte Text bleibt im Feld (Entscheidung 08/10/2026); zeigt die gespeicherte Bemerkung
 */
const INTRO = 'Das Produkt wurde inzwischen von jemand anderem geändert.';
const RELOAD_TEXT = {
  form: 'Neu laden: die aktuellen Stammdaten werden geladen — Ihre Eingaben in diesem Formular gehen verloren.',
  recalc: 'Neu laden: die Seite zeigt den aktuellen Stand; danach bitte erneut „Neu berechnen & speichern“.',
  bemerkung: 'Neu laden: die Seite wird aktualisiert, Ihr eingegebener Text bleibt im Feld erhalten.',
};

// 'recalc' auf edit.html: "Neu laden" zeichnet auch das Stammdaten-Formular neu — ungespeicherte Eingaben dort waeren
// sonst still weg (Review-Fund Phase 8, 12/10/2026).
const UNSAVED_FORM_WARNING = 'Ihre ungespeicherten Änderungen an den Stammdaten gehen dabei verloren.';

/**
 * @param {{kind: 'form'|'recalc'|'bemerkung', current?: Record<string, unknown>|null, unsavedForm?: boolean}} options
 *   current = err.current (Datensatz wie #2); unsavedForm = Stammdaten-Formular hat ungespeicherte Aenderungen ('recalc')
 * @returns {Array<string|{text: string, warn: boolean}>}
 */
export function conflictDialogLines({ kind, current = null, unsavedForm = false }) {
  const lines = [{ text: INTRO, warn: true }];
  if (kind === 'bemerkung') {
    const saved = current?.lebtab_bemerkung;
    lines.push('Gespeicherte Bemerkung jetzt:', saved ? saved : '(leer)');
  }
  lines.push(RELOAD_TEXT[kind]);
  if (kind === 'recalc' && unsavedForm) lines.push({ text: UNSAVED_FORM_WARNING, warn: true });
  lines.push('Abbrechen: nichts wird gespeichert.');
  return lines;
}

/**
 * @param {{kind: 'form'|'recalc'|'bemerkung', current?: Record<string, unknown>|null, unsavedForm?: boolean}} options
 * @returns {Promise<boolean>} true = "Neu laden"
 */
export function conflictDialog(options) {
  return confirmDialog({ title: 'Inzwischen geändert', lines: conflictDialogLines(options), confirmLabel: 'Neu laden' });
}
