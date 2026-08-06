import { Request, Response } from 'express';
import { ProductoService } from '../services/producto.service';
import { ProductoRepository } from '../repositories/producto.repository';
import { uploadProductImage, getPublicUrl } from '../services/storage.service';
import { getTenantIdByAuthId } from '../utils/tenant';
import { errorResponse, successResponse } from '../utils/response';

export class ProductoController {
  private productoService: ProductoService;
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoService = new ProductoService();
    this.productoRepository = new ProductoRepository();
  }

  getAllProductos = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const productos = await this.productoService.getAllProductos(tenantId);
      res.status(200).json(successResponse(productos));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] getAllProductos:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  getProducto = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.getProducto(req.params.id as string, tenantId);
      if (!producto) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }
      res.status(200).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] getProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  createProducto = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.createProducto(req.body, tenantId);
      res.status(201).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] createProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };

  updateProducto = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const producto = await this.productoService.updateProducto(
        req.params.id as string,
        req.body,
        tenantId
      );
      if (!producto) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }
      res.status(200).json(successResponse(producto));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] updateProducto:', error);
      res.status(500).json(errorResponse(message));
    }
  };


  uploadImage = async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = await getTenantIdByAuthId(req.user!.id);
      const id = req.params.id as string;

      if (!req.file) {
        res.status(400).json(errorResponse('No se recibió ninguna imagen'));
        return;
      }

      const producto = await this.productoRepository.findById(id, tenantId);
      if (!producto) {
        res.status(404).json(errorResponse('Producto no encontrado'));
        return;
      }

      const storagePath = await uploadProductImage(
        tenantId,
        id,
        req.file.buffer,
        req.file.mimetype
      );

      const publicUrl = getPublicUrl(storagePath);

      await this.productoRepository.updateImagePath(id, publicUrl, tenantId);

      res.status(200).json(successResponse({ imagen_url: publicUrl }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('[ProductoController] uploadImage:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
