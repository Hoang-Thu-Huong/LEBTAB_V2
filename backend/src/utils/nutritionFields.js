import { NUTRITION_COLUMNS } from './nutritionColumns.js';

/** 6 Gruppen mit kurzen deutschen Labels (docs/SPEC.md 6.1 #13). */
export const NUTRITION_GROUPS = Object.freeze([
  Object.freeze({ id: 'energie', label: 'Energie' }),
  Object.freeze({ id: 'kohlenhydrate', label: 'Kohlenhydrate' }),
  Object.freeze({ id: 'fette', label: 'Fette' }),
  Object.freeze({ id: 'vitamine', label: 'Vitamine' }),
  Object.freeze({ id: 'mineralstoffe', label: 'Mineralstoffe' }),
  Object.freeze({ id: 'aminosaeuren', label: 'Aminosäuren' }),
]);

/** Anzahl Spalten je Gruppe in DDL-Reihenfolge (docs/DATA.md 4.1) — Summe 79, per Test abgesichert. */
const GROUP_SIZES = Object.freeze({
  energie: 11,
  kohlenhydrate: 13,
  fette: 11,
  vitamine: 14,
  mineralstoffe: 10,
  aminosaeuren: 20,
});

function buildFields() {
  const fields = [];
  let index = 0;
  for (const { id } of NUTRITION_GROUPS) {
    for (let n = 0; n < GROUP_SIZES[id]; n += 1, index += 1) {
      const key = NUTRITION_COLUMNS[index];
      // label = Spaltenname ohne Praefix, unit = null: es gibt noch keine offizielle Quelle (DECISIONS #13).
      fields.push(Object.freeze({ key, label: key.replace(/^lebtab_/, ''), group: id, unit: null }));
    }
  }
  return Object.freeze(fields);
}

/** 79 Felder fuer #13 /api/meta und nutritionTable — Reihenfolge = NUTRITION_COLUMNS. */
export const NUTRITION_FIELDS = buildFields();
