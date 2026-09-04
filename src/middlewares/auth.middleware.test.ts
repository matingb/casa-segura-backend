import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from './auth.middleware';
import { AuthService } from '../services/auth.service';
import { AUTH_COOKIE_NAME } from '../config/cookie';
import { errorResponse } from '../utils/response';
import { AuthSessionMissingError } from '@supabase/supabase-js';

vi.mock('../services/auth.service');
vi.mock('../utils/response', () => ({
  errorResponse: vi.fn((message) => ({ error: message }))
}));

describe('auth.middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const USER = { id: '123', email: 'test@test.com' } as any;

  beforeEach(() => {
    req = {
      cookies: {},
      headers: {},
    };

    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    next = vi.fn();
  });

  it('debería denegar el acceso si no hay token de autenticación', async () => {
    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(errorResponse('Authentication token missing'));
    expect(next).not.toHaveBeenCalled();
  });

  it('debería permitir el acceso y adjuntar los datos del usuario si se provee un token válido mediante cookies', async () => {
    req.cookies = { [AUTH_COOKIE_NAME]: 'valid-token' };
    vi.mocked(AuthService.prototype.getUser).mockResolvedValue(USER);

    await authMiddleware(req as Request, res as Response, next);

    expect(AuthService.prototype.getUser).toHaveBeenCalledWith('valid-token');
    expect((req as any).user).toEqual(USER);
    expect(next).toHaveBeenCalled();
  });

  it('debería permitir el acceso y adjuntar los datos del usuario si se provee un token válido mediante el header de autorización', async () => {
    req.headers = { authorization: 'Bearer valid-header-token' };
    vi.mocked(AuthService.prototype.getUser).mockResolvedValue(USER);

    await authMiddleware(req as Request, res as Response, next);

    expect(AuthService.prototype.getUser).toHaveBeenCalledWith('valid-header-token');
    expect((req as any).user).toEqual(USER);
    expect(next).toHaveBeenCalled();
  });

  it('debería denegar el acceso si el token provisto es inválido o ha expirado', async () => {
    req.cookies = { [AUTH_COOKIE_NAME]: 'invalid-token' };
    const error = new Error('Invalid or expired token');
    error.name = 'AuthError';
    vi.mocked(AuthService.prototype.getUser).mockRejectedValue(error);

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(errorResponse('Invalid or expired token'));
    expect(next).not.toHaveBeenCalled();
  });

  it('debería bloquear la petición con un error interno si ocurre un fallo inesperado al validar el token', async () => {
    req.cookies = { [AUTH_COOKIE_NAME]: 'some-token' };
    vi.mocked(AuthService.prototype.getUser).mockRejectedValue(new Error('DB Connection Failed'));

    await authMiddleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(errorResponse('DB Connection Failed'));
    expect(next).not.toHaveBeenCalled();
  });

  it('clears a stale Supabase session cookie without treating it as an internal error', async () => {
    req.cookies = { [AUTH_COOKIE_NAME]: 'stale-token' };
    res.clearCookie = vi.fn().mockReturnThis();
    vi.mocked(AuthService.prototype.getUser).mockRejectedValue(new AuthSessionMissingError());

    await authMiddleware(req as Request, res as Response, next);

    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({ path: '/' })
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(errorResponse('Authentication token is invalid or expired'));
    expect(next).not.toHaveBeenCalled();
  });
});
