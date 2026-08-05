import { Router } from 'express';
import { SubtipoController } from '../controllers/subtipo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SubtipoController();

router.get('/', authMiddleware, controller.getAll);

export default router;
