import { Router } from 'express';
import { TipoOperacionController } from '../controllers/tipo-operacion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new TipoOperacionController();

router.get('/', authMiddleware, controller.getAll);

export default router;
