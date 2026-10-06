import * as metaService from '../services/metaService.js';

export async function getMeta(_req, res, next) {
  try {
    res.status(200).json(await metaService.getMeta());
  } catch (err) {
    next(err);
  }
}
