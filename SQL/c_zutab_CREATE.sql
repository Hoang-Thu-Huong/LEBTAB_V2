-- CREATE TABLE für `c_zutab`
-- Quelle: c_Zutab_V2.xlsx (Sheet "c_Zutab_V2"), 236.962 Datenzeilen
-- Spalten: LMC (Rezept-/Lebensmittelcode), LM_Zutat (Code der Zutat), Menge, Version, Anrcode
--
-- Kein natürlicher Primärschlüssel vorhanden: (LMC, LM_Zutat) ist NICHT eindeutig
-- (2.299 Paare mehrfach, davon 2.224 Zeilen komplett identisch dupliziert) ->
-- surrogater AUTO_INCREMENT Primärschlüssel `id`.
--
-- Bezug zu `lebtab`: LMC und LM_Zutat referenzieren konzeptionell lebtab.lebtab_lmc
-- (Rezept bzw. Zutat). Aktuell sind aber ca. 10,4% der LMC- und 8,3% der LM_Zutat-
-- Werte NICHT in lebtab vorhanden (u.a. weil Zutaten laut zutatenliste-View auch aus
-- zusatzstoff/anreicherung stammen können, und ~2.300 LMC-Codes evtl. aus einer noch
-- fehlenden Rezept-Tabelle). Daher bewusst KEINE harte FOREIGN KEY Constraint, nur
-- Indizes für performante JOINs. Sobald lebtab vollständig ist, siehe ALTER TABLE
-- Vorschlag am Dateiende.

CREATE TABLE IF NOT EXISTS `c_zutab` (
  `id`        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `LMC`       CHAR(6)       NOT NULL,
  `LM_Zutat`  CHAR(6)       NOT NULL,
  `Menge`     DOUBLE        NOT NULL,
  `Version`   TINYINT       NOT NULL,
  `Anrcode`   TINYINT       NOT NULL,

  PRIMARY KEY (`id`),
  KEY `idx_zutab_lmc` (`LMC`),
  KEY `idx_zutab_lm_zutat` (`LM_Zutat`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Nachtrag, sobald lebtab um die fehlenden Codes ergänzt wurde (erst dann ausführen,
-- sonst schlägt der ALTER TABLE mit "Cannot add foreign key constraint" fehl):
--
-- ALTER TABLE `c_zutab`
--   ADD CONSTRAINT `fk_zutab_lmc`      FOREIGN KEY (`LMC`)      REFERENCES `lebtab`(`lebtab_lmc`),
--   ADD CONSTRAINT `fk_zutab_lm_zutat` FOREIGN KEY (`LM_Zutat`) REFERENCES `lebtab`(`lebtab_lmc`);
