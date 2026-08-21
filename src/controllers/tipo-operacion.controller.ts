import { Request, Response } from 'express';
import { TipoOperacionService } from '../services/tipo-operacion.service';
import { errorResponse } from '../utils/response';

const service = new TipoOperacionService();

export class TipoOperacionController {
  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await service.getAll();
      res.status(200).json({ status: 'success', data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      console.error('Error in TipoOperacionController.getAll:', error);
      res.status(500).json(errorResponse(message));
    }
  };
}
