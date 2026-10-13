import { Router } from 'express';
import { SucursalController } from '../controllers/sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SucursalController();

// Las sucursales a las que el usuario tiene acceso (lo usa el SucursalContext).
router.get('/', authMiddleware, controller.getAllByUser);

// ABM desde Configuración: opera sobre todas las del tenant.
router.get('/admin',           authMiddleware, controller.getAll);
router.get('/:id/uso',         authMiddleware, controller.getResumenUso);
router.post('/',               authMiddleware, controller.create);
router.patch('/:id',           authMiddleware, controller.update);
router.delete('/:id',          authMiddleware, controller.delete);

export default router;
