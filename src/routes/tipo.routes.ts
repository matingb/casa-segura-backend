import { Router } from 'express';
import { TipoController } from '../controllers/tipo.controller';
import { DescuentoCategoriaController } from '../controllers/descuento-categoria.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new TipoController();
const descuentos = new DescuentoCategoriaController();

router.get('/', authMiddleware, controller.getAll);
router.post('/', authMiddleware, controller.create);
router.delete('/:id', authMiddleware, controller.delete);

// Descuento que aplica a todas las sucursales
router.patch('/:id/descuento', authMiddleware, descuentos.setDescuentoTipo);
// Excepción para una sucursal puntual
router.put('/:id/descuentos-sucursal', authMiddleware, descuentos.setExcepcionTipo);

export default router;
