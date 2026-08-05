import { Router } from 'express';
import { PedidoReposicionController } from '../controllers/pedido-reposicion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new PedidoReposicionController();

router.get('/', authMiddleware, controller.getAll);

export default router;
