/**
 * Spalten des CSV-Exports von lebtab (docs/SPEC.md 6.1 #12, docs/DATA.md 4.1): genau die 92 Originalspalten
 * in Tabellenreihenfolge (ORDINAL_POSITION 1-7 Basis, 8-86 Naehrwerte, 87-92 Klassifikation).
 * Die 3 technischen Spalten aus Migration 001 gehoeren NIE in den Export — deshalb nie SELECT *.
 * Aenderungen an dieser Datei sind Zone 🟡 (docs/OPERATIONS.md 8.4).
 */
import { BASIC_COLUMNS, CLASSIFICATION_COLUMNS } from './productColumns.js';
import { NUTRITION_COLUMNS } from './nutritionColumns.js';

export const LEBTAB_EXPORT_COLUMNS = Object.freeze([
  ...BASIC_COLUMNS,
  ...NUTRITION_COLUMNS,
  ...CLASSIFICATION_COLUMNS,
]);
