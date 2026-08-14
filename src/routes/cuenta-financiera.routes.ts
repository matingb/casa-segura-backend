import { Router } from 'express';
import { CuentaFinancieraController } from '../controllers/cuenta-financiera.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new CuentaFinancieraController();

router.get('/',      authMiddleware, controller.getAll);
router.get('/:id',   authMiddleware, controller.getById);
router.post('/',     authMiddleware, controller.create);
router.patch('/:id', authMiddleware, controller.update);

export default router;
