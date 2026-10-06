import { createApp } from './src/app.js';
import { pool } from './src/config/db.js';
import { getSchemaInfo } from './src/config/schemaInfo.js';
import { checkNutritionColumns } from './src/config/schemaCheck.js';
import { logger } from './src/utils/logger.js';

const PORT = Number(process.env.PORT ?? 3000);

createApp().listen(PORT, async (err) => {
  if (err) {
    // Express 5 ruft diesen Callback auch beim 'error'-Event des Servers auf (z. B. EADDRINUSE: Port belegt).
    // Exit-Code != 0, damit NSSM/Task Scheduler den Fehlstart erkennt (DECISIONS #69).
    logger.error('Server konnte nicht starten', { port: PORT, code: err.code ?? err.message });
    process.exit(1);
  }
  logger.info('LEBTAB_V2 Server gestartet', { url: `http://localhost:${PORT}` });
  try {
    await getSchemaInfo(); // loggt { technicalColumns, archive } — Server laeuft auch ohne DB weiter
    await checkNutritionColumns(pool); // nur Warnung bei Abweichung (docs/DATA.md 4.1)
  } catch (schemaErr) {
    logger.warn('Schema-Status nicht lesbar (DB nicht erreichbar?)', {
      code: schemaErr.code ?? schemaErr.message,
    });
  }
});
