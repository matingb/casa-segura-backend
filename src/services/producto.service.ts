import { ProductoRepository } from '../repositories/producto.repository';

export class ProductoService {
  private productoRepository: ProductoRepository;

  constructor() {
    this.productoRepository = new ProductoRepository();
  }

  async getAllProductos() {
    const productos = await this.productoRepository.findAll();
    return productos;
  }
}
