import { Router } from 'express';
import multer from 'multer';
import { ProductoController } from '../controllers/producto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const productoController = new ProductoController();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes (jpeg, png, webp, gif).'));
    }
  },
});

router.get('/',                 authMiddleware, productoController.getAllProductos);
router.get('/valores-unicos',   authMiddleware, productoController.getValoresUnicos);
router.get('/:id',              authMiddleware, productoController.getProducto);
router.post('/',    authMiddleware, productoController.createProducto);
router.patch('/:id', authMiddleware, productoController.updateProducto);
router.patch('/:id/imagen', authMiddleware, upload.single('imagen'), productoController.uploadImage);

export default router;
