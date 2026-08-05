import { Router } from 'express';
import { CuentaFinancieraController } from '../controllers/cuenta-financiera.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new CuentaFinancieraController();

router.get('/', authMiddleware, controller.getAll);

export default router;
