import { describe, it, expect, vi } from 'vitest';
import { insertIngredientArchive } from './archiveModel.js';

const ROW = { id: 98123, LMC: 'A1CK00', LM_Zutat: 'AFB000', Menge: 25, Version: 3, Anrcode: 0 };

describe('archiveModel.insertIngredientArchive (Phase 7, #9)', () => {
  it('copies the row with its ORIGINAL id, lebtab_archive_id NULL for a single deletion, deleted_by NULL', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await insertIngredientArchive(ROW, null, conn);
    const sql = conn.query.mock.calls[0][0].replace(/\s+/g, ' ');
    expect(sql).toBe(
      'INSERT INTO c_zutab_archive (id, LMC, LM_Zutat, Menge, Version, Anrcode, lebtab_archive_id, deleted_by) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
    );
    expect(conn.query.mock.calls[0][1]).toEqual([98123, 'A1CK00', 'AFB000', 25, 3, 0, null]);
    expect(sql).not.toContain('deleted_at'); // DEFAULT CURRENT_TIMESTAMP der DB, nie NOW() aus dem Code
  });

  it('passes the parent archive id through (used by Phase 9 when a whole product is archived)', async () => {
    const conn = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await insertIngredientArchive(ROW, 42, conn);
    expect(conn.query.mock.calls[0][1][6]).toBe(42);
  });
});
