import * as exportService from '../services/exportService.js';

/**
 * #12 CSV-Download. Fehler VOR dem ersten Byte gehen als JSON an den errorHandler (400/503/500). Danach sind die
 * Header gesendet: die Verbindung wird abgebrochen, damit der Browser den Download als fehlgeschlagen zeigt und
 * keine unvollstaendige Datei wie eine fertige aussieht.
 */
export async function exportCsv(req, res, next) {
  try {
    const type = exportService.parseExportType(req.query);
    const result = await exportService.streamExport(type, res, () => {
      res.status(200).set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${exportService.exportFilename(type)}"`,
        'Cache-Control': 'no-store',
      });
    });
    if (!result.aborted) res.end();
  } catch (err) {
    if (res.headersSent) res.destroy();
    else next(err);
  }
}
