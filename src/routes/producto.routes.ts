import { Router } from 'express';
import { ProductoController } from '../controllers/producto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const productoController = new ProductoController();

router.get('/', authMiddleware, productoController.getAllProductos);

export default router;
