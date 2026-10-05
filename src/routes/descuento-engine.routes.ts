import { Router } from 'express';
import { DescuentoEngineController } from '../controllers/descuento-engine.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new DescuentoEngineController();
router.get('/lista-cliente', authMiddleware, controller.listaCliente);

// Evaluación centralizada de descuentos y análisis de margen
router.post('/evaluar', authMiddleware, controller.evaluar);
router.post('/calcular', authMiddleware, controller.evaluar);

export default router;
