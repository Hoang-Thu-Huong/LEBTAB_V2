/**
 * Einziger Ort im Backend, an dem console.* aufgerufen werden darf (docs/ARCHITECTURE.md 8.1).
 * Format: <ISO-Zeit> [LEVEL] <message> <meta als JSON, optional>
 */
function format(level, message, meta) {
  const base = `${new Date().toISOString()} [${level}] ${message}`;
  return meta === undefined ? base : `${base} ${JSON.stringify(meta)}`;
}

export const logger = {
  /** @param {string} message @param {object} [meta] */
  info(message, meta) {
    console.log(format('INFO', message, meta));
  },
  /** @param {string} message @param {object} [meta] */
  warn(message, meta) {
    console.warn(format('WARN', message, meta));
  },
  /** @param {string} message @param {object} [meta] */
  error(message, meta) {
    console.error(format('ERROR', message, meta));
  },
};
