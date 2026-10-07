/**
 * Nur fuer Tests: minimaler RFC-4180-Parser (Trennzeichen ',', Felder optional in "…", "" = ein Anfuehrungszeichen,
 * CR/LF innerhalb von Anfuehrungszeichen gehoeren zum Feld). Unterscheidet NULL (leeres Feld -> null) von "" (-> '').
 * @param {string} text CSV ohne BOM
 * @returns {Array<Array<string|null>>}
 */
export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false; // gerade innerhalb von "…"
  let wasQuoted = false; // aktuelles Feld hatte Anfuehrungszeichen
  const endField = () => {
    record.push(field === '' && !wasQuoted ? null : field);
    field = '';
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
    } else if (ch === '"') {
      quoted = true;
      wasQuoted = true;
    } else if (ch === ',') endField();
    else if (ch === '\r' && text[i + 1] === '\n') {
      endField();
      records.push(record);
      record = [];
      i += 1;
    } else field += ch;
  }
  if (field !== '' || wasQuoted || record.length > 0) {
    endField();
    records.push(record);
  }
  return records;
}
