import * as ingredientService from '../services/ingredientService.js';

/** #7: Body kommt validiert aus validateRequest(parseAddIngredientBody). 200 auch bei DUPLICATE_INGREDIENT (SPEC 5.3). */
export async function addIngredient(req, res, next) {
  try {
    res.status(200).json(await ingredientService.addIngredient(req.params.lmc, req.validated));
  } catch (err) {
    next(err);
  }
}

/** #8: Body kommt validiert aus validateRequest(parseUpdateIngredientBody); :id prueft der Service (404). */
export async function updateIngredient(req, res, next) {
  try {
    res.status(200).json(await ingredientService.updateIngredient(req.params.lmc, req.params.id, req.validated));
  } catch (err) {
    next(err);
  }
}

/** #9: Soft-Delete mit Archiv. */
export async function deleteIngredient(req, res, next) {
  try {
    res.status(200).json(await ingredientService.deleteIngredient(req.params.lmc, req.params.id));
  } catch (err) {
    next(err);
  }
}
