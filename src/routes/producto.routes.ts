import { Router } from 'express';
import { ProductoController } from '../controllers/producto.controller';

const router = Router();
const productoController = new ProductoController();

router.get('/', productoController.getAllProductos);

export default router;
