import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { ProductoController } from '../controllers/producto.controller';
import { confirmarAumento, previsualizarAumento } from '../controllers/aumento-precios.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { errorResponse } from '../utils/response';

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
}).single('imagen');

const recibirImagen: RequestHandler = (req, res, next) => {
  upload(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const mensaje = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'La imagen debe pesar hasta 5 MB.'
      : error instanceof Error ? error.message : 'No se pudo leer la imagen.';
    res.status(400).json(errorResponse(mensaje));
  });
};

const recibirProducto: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  recibirImagen(req, res, () => {
    let datos: unknown;
    try {
      if (typeof req.body.datos === 'string') datos = JSON.parse(req.body.datos);
    } catch {
      datos = null;
    }
    if (!req.file || !datos || typeof datos !== 'object' || Array.isArray(datos)) {
      res.status(400).json(errorResponse('Enviá los datos del producto y una imagen válida.'));
      return;
    }
    req.body = datos;
    next();
  });
};

router.get('/',                 authMiddleware, productoController.getAllProductos);
router.get('/valores-unicos',   authMiddleware, productoController.getValoresUnicos);
router.get('/:id',              authMiddleware, productoController.getProducto);
router.post('/aumento-masivo/vista-previa', authMiddleware, previsualizarAumento);
router.post('/aumento-masivo', authMiddleware, confirmarAumento);
router.post('/',    authMiddleware, recibirProducto, productoController.createProducto);
router.patch('/:id', authMiddleware, recibirProducto, productoController.updateProducto);
router.patch('/:id/imagen', authMiddleware, recibirImagen, productoController.uploadImage);
router.delete('/:id', authMiddleware, productoController.deleteProducto);

export default router;
