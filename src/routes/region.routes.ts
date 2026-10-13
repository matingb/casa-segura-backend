import { Router } from 'express';
import { RegionController } from '../controllers/region.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const controller = new RegionController();

router.get('/sucursal/:sucursalId',   authMiddleware, controller.getRegionesPorSucursal);
router.get('/:id',                    authMiddleware, controller.getRegion);
router.post('/',                      authMiddleware, controller.createRegion);
router.put('/:id',                    authMiddleware, controller.updateRegion);
router.patch('/:id',                  authMiddleware, controller.updateRegion);
router.delete('/:id',                 authMiddleware, controller.deleteRegion);

export default router;
