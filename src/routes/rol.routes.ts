import { Router } from 'express';
import { RolController } from '../controllers/rol.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new RolController();

router.get('/', authMiddleware, controller.getAll);

export default router;
