import { createApp } from './src/app.js';
import { getSchemaInfo } from './src/config/schemaInfo.js';
import { logger } from './src/utils/logger.js';

const PORT = Number(process.env.PORT ?? 3000);

createApp().listen(PORT, async () => {
  logger.info('LEBTAB_V2 Server gestartet', { url: `http://localhost:${PORT}` });
  try {
    await getSchemaInfo(); // loggt { technicalColumns, archive } — Server laeuft auch ohne DB weiter
  } catch (err) {
    logger.warn('Schema-Status nicht lesbar (DB nicht erreichbar?)', { code: err.code ?? err.message });
  }
});
