import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { CotizacionController } from '../controllers/cotizacion.controller';
const router = Router();
const controller = new CotizacionController();
router.get('/cotizacion', authMiddleware, controller.obtener);
router.patch('/cotizacion', authMiddleware, controller.actualizar);
export default router;
