import { Router } from 'express';
import { SucursalController } from '../controllers/sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new SucursalController();

// Las sucursales a las que el usuario tiene acceso (lo usa el SucursalContext).
router.get('/', authMiddleware, controller.getAllByUser);

// La configuración administrativa devuelve fichas completas solo de PDV propios.
router.get('/admin',           authMiddleware, controller.getAll);
router.get('/opciones-asignacion', authMiddleware, controller.getOpcionesAsignacion);
// Referencia mínima del tenant para excepciones globales (categorías y casa central).
router.get('/referencias-globales', authMiddleware, controller.getReferenciasGlobales);
router.get('/:id/uso',         authMiddleware, controller.getResumenUso);
router.get('/:id/usuarios',    authMiddleware, controller.getUsuarios);
router.post('/',               authMiddleware, controller.create);
router.patch('/:id',           authMiddleware, controller.update);
router.delete('/:id',          authMiddleware, controller.delete);

export default router;
