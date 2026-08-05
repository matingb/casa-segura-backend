import { Router } from 'express';
import { UsuarioSucursalController } from '../controllers/usuario-sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new UsuarioSucursalController();

router.get('/', authMiddleware, controller.getAll);

export default router;
