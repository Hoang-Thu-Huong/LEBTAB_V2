import { confirmDialog } from '../../components/confirmDialog.js';
import { changedValues, recalcDialogContent } from '../../utils/recalcPreview.js';

/**
 * Ablauf "Neu berechnen & speichern" (docs/SPEC.md 5.9, docs/ARCHITECTURE.md 7.5; Entscheidung 08/10/2026):
 * Vorschau laden (#17) -> Dialog mit den Werten, die sich aendern -> erst "Speichern" ruft #6 mit recipeVersion.
 * 409 RECIPE_CHANGED (Rezeptur seit der Vorschau geaendert) -> Vorschau neu laden, Dialog mit rotem Hinweis erneut.
 * Ruft nie api.* auf — loadPreview/save kommen von edit.js; alle anderen Fehler gehen an edit.js zurueck.
 * @param {{fields: Array<{key: string, label: string, unit: string|null}>}} props fields = meta.nutritionFields
 * @param {{loadPreview: () => Promise<import('../../utils/recalcPreview.js').RecalcPreview>,
 *   save: (preview: import('../../utils/recalcPreview.js').RecalcPreview) => Promise<object>}} handlers
 * @returns {Promise<{result: object, changedCount: number} | null>} null = abgebrochen
 */
export async function runRecalcDialog({ fields }, { loadPreview, save }) {
  let notice = null;
  for (;;) {
    const preview = await loadPreview();
    if (!(await confirmDialog(recalcDialogContent(preview, fields, notice)))) return null;
    try {
      const result = await save(preview);
      return { result, changedCount: changedValues(preview.current, preview.nutrition, fields).length };
    } catch (err) {
      if (err.code !== 'RECIPE_CHANGED') throw err;
      notice = err.message;
    }
  }
}
