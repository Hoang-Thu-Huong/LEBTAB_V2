/**
 * Deutsche Labels der 13 Stammdaten-Felder (7 Basis + 6 Klassifikation) — EINE Stelle fuer detail, create, edit
 * (DECISIONS #65). type steuert nur die Anzeige: 'date' -> DD.MM.YYYY, 'number' -> unveraendert, 'itemart' -> Tag.
 */
export const PRODUCT_INFO_FIELDS = Object.freeze([
  { key: 'lebtab_lmc', label: 'LMC', type: 'text' },
  { key: 'lebtab_Bezeich', label: 'Bezeichnung', type: 'text' },
  { key: 'lebtab_Marke', label: 'Marke', type: 'text' },
  { key: 'lebtab_Version', label: 'Version', type: 'number' },
  { key: 'lebtab_Itemart', label: 'Itemart', type: 'itemart' },
  { key: 'lebtab_Datum', label: 'Datum', type: 'date' },
  { key: 'lebtab_aktuell', label: 'Aktuell', type: 'number' },
  { key: 'lebtab_lmgruppe', label: 'LM-Gruppe', type: 'number' },
  { key: 'lebtab_gruppename', label: 'Gruppenname', type: 'text' },
  { key: 'lebtab_source', label: 'Quelle', type: 'text' },
  { key: 'lebtab_source_code', label: 'Quellcode', type: 'text' },
  { key: 'lebtab_source_detail', label: 'Quelle (Detail)', type: 'text' },
  { key: 'lebtab_probiotisch', label: 'Probiotisch', type: 'number' },
]);
