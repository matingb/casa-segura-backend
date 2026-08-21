import { Router } from 'express';
import { PedidoReposicionController } from '../controllers/pedido-reposicion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new PedidoReposicionController();

router.get('/',                authMiddleware, controller.getAll);
router.get('/valores-unicos',  authMiddleware, controller.getValoresUnicos);
router.post('/',               authMiddleware, controller.create);

export default router;
