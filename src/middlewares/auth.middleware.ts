import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AUTH_COOKIE_NAME } from '../config/cookie';
import { errorResponse } from '../utils/response';

const authService = new AuthService();

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.[AUTH_COOKIE_NAME] ?? req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json(errorResponse('Authentication token missing'));
      return;
    }

    req.user = await authService.getUser(token);
    next();
  } catch (error: unknown) {
    const isAuthError = error instanceof Error && error.name === 'AuthError';
    if (isAuthError) {
      res.status(401).json(errorResponse('Invalid or expired token'));
      return;
    }
    console.error('Auth middleware error:', error);
    res.status(500).json(errorResponse('Internal server error during authentication'));
  }
};
