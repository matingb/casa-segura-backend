import { Request, Response, NextFunction } from 'express';
import { isAuthError } from '@supabase/supabase-js';
import { AuthService } from '../services/auth.service';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '../config/cookie';
import { errorResponse } from '../utils/response';

const authService = new AuthService();

export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
    const token = cookieToken ?? req.headers.authorization?.split(' ')[1];

    if (!token) {
      res.status(401).json(errorResponse('Authentication token missing'));
      return;
    }

    req.user = await authService.getUser(token);
    next();
  } catch (error: unknown) {
    if (isAuthError(error)) {
      // A signed-out or expired Supabase session is an expected 401. Remove the
      // stale browser cookie so the next request starts from the login flow.
      if (req.cookies?.[AUTH_COOKIE_NAME]) {
        res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
      }

      res.status(401).json(errorResponse('Authentication token is invalid or expired'));
      return;
    }

    const message = error instanceof Error ? error.message : 'Invalid or expired token';
    console.error('Auth middleware error:', error);
    res.status(401).json(errorResponse(message));
  }
};
