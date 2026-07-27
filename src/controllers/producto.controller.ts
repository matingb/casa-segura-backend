import { Request, Response } from 'express';
import { ProductoService } from '../services/producto.service';

export class ProductoController {
  private productoService: ProductoService;

  constructor() {
    this.productoService = new ProductoService();
  }

  getAllProductos = async (req: Request, res: Response) => {
    try {
      const productos = await this.productoService.getAllProductos();
      
      res.status(200).json({
        status: 'success',
        data: productos
      });
      
    } catch (error: any) {
      console.error('Error in getAllProductos controller:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Internal server error'
      });
    }
  };
}
