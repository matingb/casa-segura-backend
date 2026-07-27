import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '../config/cookie';
import { successResponse, errorResponse } from '../utils/response';

const authService = new AuthService();

export class AuthController {
  login = async (req: Request, res: Response): Promise<void> => {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json(errorResponse('Email and password are required'));
      return;
    }

    try {
      const { user, accessToken, expiresIn } = await authService.signIn(email, password);

      res.cookie(AUTH_COOKIE_NAME, accessToken, {
        ...AUTH_COOKIE_OPTIONS,
        maxAge: expiresIn * 1000,
      });

      res.status(200).json(successResponse({ user: { id: user.id, email: user.email } }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error during login';
      console.error('Login error:', error);
      const isAuthError = error instanceof Error && error.name === 'AuthError';
      res.status(isAuthError ? 401 : 500).json(errorResponse(message));
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const token = req.cookies?.[AUTH_COOKIE_NAME];

    if (token) {
      try {
        await authService.signOut(token);
      } catch (error: unknown) {
        // Log the error but proceed with cookie cleanup regardless
        console.error('Supabase sign out error:', error);
      }
    }

    res.clearCookie(AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS);
    res.status(200).json(successResponse({ message: 'Logged out successfully' }));
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const { user } = req;

    if (!user) {
      res.status(401).json(errorResponse('Not authenticated'));
      return;
    }

    res.status(200).json(successResponse({ user: { id: user.id, email: user.email } }));
  };
}
