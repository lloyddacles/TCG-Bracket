import { Router } from 'express';
import { all } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({ games: await all('SELECT * FROM games ORDER BY name COLLATE NOCASE') });
});

export default router;
