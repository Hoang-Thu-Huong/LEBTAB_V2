import * as healthService from '../services/healthService.js';

export async function getHealth(_req, res, next) {
  try {
    res.status(200).json(await healthService.check());
  } catch (err) {
    next(err);
  }
}
