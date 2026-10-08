import { Router } from 'express';
import { validateRequest } from '../middlewares/validateRequest.js';
import { parseAddIngredientBody, parseUpdateIngredientBody } from '../utils/ingredientPayload.js';
import { addIngredient, updateIngredient, deleteIngredient } from '../controllers/ingredientController.js';

/** Eingehaengt unter /api/products/:lmc/ingredients (productRoutes.js) — mergeParams reicht :lmc durch. */
export const ingredientRoutes = Router({ mergeParams: true });
ingredientRoutes.post('/', validateRequest(parseAddIngredientBody), addIngredient); // #7
ingredientRoutes.put('/:id', validateRequest(parseUpdateIngredientBody), updateIngredient); // #8
ingredientRoutes.delete('/:id', deleteIngredient); // #9
