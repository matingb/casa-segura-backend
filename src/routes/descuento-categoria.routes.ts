import { Router } from 'express';
import { DescuentoCategoriaController } from '../controllers/descuento-categoria.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new DescuentoCategoriaController();

router.delete('/:id', authMiddleware, controller.eliminarExcepcion);

export default router;
