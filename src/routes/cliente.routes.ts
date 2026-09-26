import { Router } from 'express';
import { ClienteController } from '../controllers/cliente.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const clienteController = new ClienteController();

router.get('/',               authMiddleware, clienteController.getAllClientes);
router.get('/valores-unicos', authMiddleware, clienteController.getValoresUnicos);
router.get('/:id',            authMiddleware, clienteController.getCliente);
router.post('/',              authMiddleware, clienteController.createCliente);
router.patch('/:id',          authMiddleware, clienteController.updateCliente);
router.delete('/:id',         authMiddleware, clienteController.deleteCliente);

export default router;
