/**
 * Nicht-Naehrwert-Spalten von lebtab (docs/DATA.md 4.0, 4.1). Schreibweise = Doku-Schreibweise:
 * MariaDB liefert den Schluessel so, wie er im SELECT steht (physisch heissen 5 Spalten klein) — deshalb nie SELECT *.
 */
export const BASIC_COLUMNS = Object.freeze([
  'lebtab_lmc',
  'lebtab_Bezeich',
  'lebtab_Marke',
  'lebtab_Version',
  'lebtab_Itemart',
  'lebtab_Datum',
  'lebtab_aktuell',
]);

/** 6 Klassifikations-/Quellspalten — KEINE Naehrwerte, duerfen nie in nutritionColumns.js landen. */
export const CLASSIFICATION_COLUMNS = Object.freeze([
  'lebtab_lmgruppe',
  'lebtab_gruppename',
  'lebtab_source',
  'lebtab_source_code',
  'lebtab_source_detail',
  'lebtab_probiotisch',
]);

/** 3 technische Spalten aus Migration 001 — existieren erst nach deren Ausfuehrung (schemaInfo.technicalColumns). */
export const TECHNICAL_COLUMNS = Object.freeze([
  '_row_version',
  'lebtab_nutrition_stale',
  'lebtab_bemerkung',
]);

/** Antwortwerte fuer #2, solange 001 nicht gelaufen ist = DEFAULTs der Migration (DECISIONS #57). */
export const TECHNICAL_DEFAULTS = Object.freeze({
  _row_version: 1,
  lebtab_nutrition_stale: 0,
  lebtab_bemerkung: null,
});
