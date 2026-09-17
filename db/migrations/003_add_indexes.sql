-- 003_add_indexes.sql — LEBTAB_V2 (docs/DATA.md 4.5), optional, unabhaengig von 001/002
-- Nur ADD INDEX, KEIN UNIQUE (2.299 doppelte (LMC, LM_Zutat)-Paare sind gewollt).
-- Pruefung danach: SHOW INDEX FROM c_zutab WHERE Key_name = 'idx_czutab_lmc_lmzutat';  -> 2 Zeilen

USE lebtab_new;

ALTER TABLE lebtab
  ADD INDEX idx_lebtab_itemart (lebtab_Itemart),
  ADD INDEX idx_lebtab_datum (lebtab_Datum);

ALTER TABLE c_zutab
  ADD INDEX idx_czutab_lmc_lmzutat (LMC, LM_Zutat);
