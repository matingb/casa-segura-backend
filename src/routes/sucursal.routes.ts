import { Router } from 'express';
import { SucursalController } from '../controllers/sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SucursalController();

router.get('/', authMiddleware, controller.getAll);

export default router;
