/**
 * DIE eine Quelle der Wahrheit fuer die 79 Naehrwertspalten (DOUBLE NULL) von lebtab — docs/DATA.md 4.1.
 * Reihenfolge = ORDINAL_POSITION in der DB. Gross-/Kleinschreibung exakt wie im DDL (lebtab_v_A, lebtab_FiB, ...).
 * NIE um Klassifikations- oder technische Spalten erweitern: recalculate wuerde sie ueberschreiben.
 * Aenderungen an dieser Datei sind Zone 🟡 (docs/OPERATIONS.md 8.4).
 */
export const NUTRITION_COLUMNS = Object.freeze([
  // energie (11)
  'lebtab_E_CAL', 'lebtab_E_JOULE', 'lebtab_EW', 'lebtab_t_ew', 'lebtab_FETT', 'lebtab_KH',
  'lebtab_ALKO', 'lebtab_H2O', 'lebtab_FiB', 'lebtab_L_FIB', 'lebtab_U_FIB',
  // kohlenhydrate (13)
  'lebtab_Gluc', 'lebtab_Fruc', 'lebtab_Galac', 'lebtab_MSacch', 'lebtab_Sacch', 'lebtab_MALT',
  'lebtab_LACT', 'lebtab_DISACCH', 'lebtab_ZUCK', 'lebtab_STAERKE', 'lebtab_GI', 'lebtab_zuzu',
  'lebtab_frzu',
  // fette (11)
  'lebtab_CHOL', 'lebtab_S_FS', 'lebtab_M_FS', 'lebtab_P_FS', 'lebtab_F180', 'lebtab_F181',
  'lebtab_F182', 'lebtab_F183', 'lebtab_F204', 'lebtab_F205', 'lebtab_F226',
  // vitamine (14)
  'lebtab_v_A', 'lebtab_CAROT', 'lebtab_V_D', 'lebtab_v_e', 'lebtab_V_K', 'lebtab_V_B1',
  'lebtab_V_B2', 'lebtab_NIACI', 'lebtab_PANTO', 'lebtab_V_B6', 'lebtab_BIOTI', 'lebtab_FOL_EQ',
  'lebtab_V_B12', 'lebtab_V_C',
  // mineralstoffe (10)
  'lebtab_NATR', 'lebtab_KALI', 'lebtab_CALC', 'lebtab_MAGN', 'lebtab_PHOS', 'lebtab_EISE',
  'lebtab_ZINK', 'lebtab_KUPF', 'lebtab_MANG', 'lebtab_JOD',
  // aminosaeuren (20)
  'lebtab_ISO', 'lebtab_LEU', 'lebtab_LYS', 'lebtab_MET', 'lebtab_CYS', 'lebtab_PHE',
  'lebtab_TYR', 'lebtab_THR', 'lebtab_TRY', 'lebtab_VAL', 'lebtab_ARG', 'lebtab_HIS',
  'lebtab_ESSAS', 'lebtab_ALA', 'lebtab_ASP', 'lebtab_GLU', 'lebtab_GLY', 'lebtab_PRO',
  'lebtab_SER', 'lebtab_NESSAS',
]);
