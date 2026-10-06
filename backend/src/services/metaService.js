import { getSchemaInfo } from '../config/schemaInfo.js';
import { ITEMARTS } from '../utils/itemarts.js';
import { NUTRITION_FIELDS, NUTRITION_GROUPS } from '../utils/nutritionFields.js';
import { BEMERKUNG_MAX_LENGTH, PHOTO_MAX_PER_PRODUCT, PHOTO_MAX_SIZE } from '../utils/limits.js';

/**
 * Metadaten fuer das Frontend (docs/SPEC.md 6.1 #13). Aendert sich nur beim Deploy bzw. nach einer Migration
 * (features) — das Frontend cached die Antwort in sessionStorage.
 * @returns {Promise<{nutritionGroups: object[], nutritionFields: object[], itemarts: string[],
 *   features: {technicalColumns: boolean, archive: boolean},
 *   limits: {photoMaxPerProduct: number, photoMaxSize: number, bemerkungMaxLength: number}}>}
 */
export async function getMeta() {
  const { technicalColumns, archive } = await getSchemaInfo();
  return {
    nutritionGroups: NUTRITION_GROUPS,
    nutritionFields: NUTRITION_FIELDS,
    itemarts: ITEMARTS,
    features: { technicalColumns, archive },
    limits: {
      photoMaxPerProduct: PHOTO_MAX_PER_PRODUCT,
      photoMaxSize: PHOTO_MAX_SIZE,
      bemerkungMaxLength: BEMERKUNG_MAX_LENGTH,
    },
  };
}
