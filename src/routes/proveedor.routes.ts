import { Router } from 'express';
import { ProveedorController } from '../controllers/proveedor.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new ProveedorController();

router.get('/', authMiddleware, controller.getAll);

export default router;
