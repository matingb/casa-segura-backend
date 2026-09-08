import { Router } from 'express';
import { OperacionController } from '../controllers/operacion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new OperacionController();

router.get('/',                authMiddleware, controller.getAll);
router.get('/valores-unicos',  authMiddleware, controller.getValoresUnicos);
router.get('/:id',             authMiddleware, controller.getById);
router.post('/',    authMiddleware, controller.create);
router.post('/:id/cancelar', authMiddleware, controller.cancelar);

export default router;

