import { Router } from 'express';
import { ClienteController } from '../controllers/cliente.controller';
import { ClienteDescuentoController } from '../controllers/cliente-descuento.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const clienteController = new ClienteController();
const descuentoController = new ClienteDescuentoController();

router.get('/',               authMiddleware, clienteController.getAllClientes);
router.get('/valores-unicos', authMiddleware, clienteController.getValoresUnicos);
router.get('/:id',            authMiddleware, clienteController.getCliente);
router.post('/',              authMiddleware, clienteController.createCliente);
router.patch('/:id',          authMiddleware, clienteController.updateCliente);
router.delete('/:id',         authMiddleware, clienteController.deleteCliente);

// Descuentos del cliente
router.get('/:id/descuentos',                       authMiddleware, descuentoController.getDescuentos);
router.post('/:id/descuentos/categoria',            authMiddleware, descuentoController.asignarCategoria);
router.delete('/:id/descuentos/categoria/:descuentoId', authMiddleware, descuentoController.quitarCategoria);
router.post('/:id/descuentos/producto',             authMiddleware, descuentoController.asignarProducto);
router.delete('/:id/descuentos/producto/:descuentoId',  authMiddleware, descuentoController.quitarProducto);
router.put('/:id/region',                           authMiddleware, descuentoController.asignarRegion);
router.delete('/:id/region/:sucursalId',            authMiddleware, descuentoController.quitarRegion);

export default router;
