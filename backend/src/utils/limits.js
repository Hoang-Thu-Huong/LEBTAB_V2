/** Alle Grenzwerte an einer Stelle (docs/ARCHITECTURE.md 3.2, 8.1). #13 /api/meta liest `limits` von hier. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 200;
/** = Laenge von lebtab_Bezeich VARCHAR(255) (DECISIONS #60). */
export const SEARCH_MAX_LENGTH = 255;
export const PHOTO_MAX_PER_PRODUCT = 10;
export const PHOTO_MAX_SIZE = 10 * 1024 * 1024;
export const BEMERKUNG_MAX_LENGTH = 10000;

/** Dateien je Upload-Request (docs/SPEC.md 5.8, #15). */
export const PHOTO_MAX_FILES_PER_REQUEST = 10;

/** Rezepturzeilen je Produkt beim Anlegen (#3); groesste Rezeptur im Bestand: 172 Zeilen (Phase 6). */
export const INGREDIENT_MAX_PER_PRODUCT = 500;
/** Obergrenze fuer Menge einer Rezepturzeile; groesster Wert im Bestand: 500000 (Zusatz in µg). */
export const MENGE_MAX = 1000000000;
/** Groesse des JSON-Bodys (express.json); Begruendung docs/ARCHITECTURE.md 3.2. */
export const JSON_BODY_LIMIT_MB = 1;
