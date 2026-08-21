import { Router } from 'express';
import { ProductoSucursalController } from '../controllers/producto-sucursal.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new ProductoSucursalController();

router.get('/',                authMiddleware, controller.getAll);
router.get('/valores-unicos',  authMiddleware, controller.getValoresUnicos);
router.get('/:id',             authMiddleware, controller.getById);
router.post('/',     authMiddleware, controller.create);
router.patch('/:id', authMiddleware, controller.update);

export default router;
