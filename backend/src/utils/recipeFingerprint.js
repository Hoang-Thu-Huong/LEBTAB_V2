import { createHash } from 'node:crypto';

/**
 * Stand einer Rezeptur fuer die Vorschau #17 und das Speichern #6 (docs/SPEC.md 6.1): SHA-1 ueber (id, LM_Zutat, Menge)
 * aller c_zutab-Zeilen, nach id sortiert. Aendert jemand zwischen Vorschau und Speichern eine Zeile (hinzufuegen, Menge,
 * loeschen), aendert sich der Wert -> #6 antwortet 409 RECIPE_CHANGED. Zutaten-Endpunkte erhoehen _row_version
 * absichtlich nicht (docs/SPEC.md 5.6) — deshalb dieser zweite Stand.
 * @param {Array<{id: number, LM_Zutat: string, Menge: number}>} rows
 * @returns {string} 40 Zeichen hex (klein)
 */
export function recipeFingerprint(rows) {
  const lines = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((row) => `${row.id}\t${row.LM_Zutat}\t${row.Menge}`);
  return createHash('sha1').update(lines.join('\n')).digest('hex');
}
