/**
 * Deutsche Labels der 13 Stammdaten-Felder (7 Basis + 6 Klassifikation) — EINE Stelle fuer detail, create, edit
 * (DECISIONS #65). type steuert nur die Anzeige: 'date' -> DD.MM.YYYY, 'number' -> unveraendert, 'itemart' -> Tag.
 * Eingabe-Metadaten (ab Phase 6, Formulare create/edit): input = Art des Eingabefelds ('lmc' | 'text' | 'int' |
 * 'date' | 'itemart'), maxLength = Spaltenlaenge laut DDL, required = NOT-NULL-Spalte, min = kleinster erlaubter Wert.
 */
export const PRODUCT_INFO_FIELDS = Object.freeze([
  { key: 'lebtab_lmc', label: 'LMC', type: 'text', input: 'lmc', maxLength: 6, required: true },
  { key: 'lebtab_Bezeich', label: 'Bezeichnung', type: 'text', input: 'text', maxLength: 255, required: true },
  { key: 'lebtab_Marke', label: 'Marke', type: 'text', input: 'text', maxLength: 191 },
  { key: 'lebtab_Version', label: 'Version', type: 'number', input: 'int' },
  { key: 'lebtab_Itemart', label: 'Itemart', type: 'itemart', input: 'itemart', required: true },
  { key: 'lebtab_Datum', label: 'Datum', type: 'date', input: 'date', required: true },
  { key: 'lebtab_aktuell', label: 'Aktuell', type: 'number', input: 'int', required: true, min: 0 },
  { key: 'lebtab_lmgruppe', label: 'LM-Gruppe', type: 'number', input: 'int' },
  { key: 'lebtab_gruppename', label: 'Gruppenname', type: 'text', input: 'text', maxLength: 100 },
  { key: 'lebtab_source', label: 'Quelle', type: 'text', input: 'text', maxLength: 45 },
  { key: 'lebtab_source_code', label: 'Quellcode', type: 'text', input: 'text', maxLength: 45 },
  { key: 'lebtab_source_detail', label: 'Quelle (Detail)', type: 'text', input: 'text', maxLength: 100 },
  { key: 'lebtab_probiotisch', label: 'Probiotisch', type: 'number', input: 'int' },
]);
