import { Router } from 'express';
import { ProductoSucursalController } from '../controllers/producto-sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new ProductoSucursalController();

router.get('/', authMiddleware, controller.getAll);

export default router;
