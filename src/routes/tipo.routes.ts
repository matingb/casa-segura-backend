import { Router } from 'express';
import { TipoController } from '../controllers/tipo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new TipoController();

router.get('/', authMiddleware, controller.getAll);
router.post('/', authMiddleware, controller.create);
router.delete('/:id', authMiddleware, controller.delete);

export default router;
