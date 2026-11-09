import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { AuthApiError } from '@supabase/supabase-js';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';

vi.mock('../services/auth.service');

describe('AuthController', () => {
  let controller: AuthController;
  let req: any;
  let res: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new AuthController();
    req = { body: {}, cookies: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
  });

  describe('login', () => {
    it('debería retornar 400 si faltan credenciales', async () => {
      req.body = { email: 'a@b.com' };

      await controller.login(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('debería retornar 200 y setear la cookie con credenciales válidas', async () => {
      req.body = { email: 'a@b.com', password: 'ok' };
      vi.mocked(AuthService.prototype.signIn).mockResolvedValue({
        user: { id: 'u-1', email: 'a@b.com' },
        accessToken: 'token-abc',
        refreshToken: 'refresh-xyz',
        expiresIn: 3600,
      } as any);

      await controller.login(req, res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'token-abc',
        expect.objectContaining({ httpOnly: true, maxAge: 3600 * 1000 })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-xyz',
        expect.objectContaining({ httpOnly: true })
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    // Supabase lanza AuthApiError (subclase de AuthError). Comparar `name === 'AuthError'`
    // devolvía 500 ante credenciales inválidas y el front no podía mostrar el error.
    it('debería retornar 401 ante credenciales inválidas (AuthApiError)', async () => {
      req.body = { email: 'a@b.com', password: 'wrong' };
      vi.mocked(AuthService.prototype.signIn).mockRejectedValue(
        new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
      );

      await controller.login(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('debería retornar 500 ante un error inesperado', async () => {
      req.body = { email: 'a@b.com', password: 'ok' };
      vi.mocked(AuthService.prototype.signIn).mockRejectedValue(new Error('DB caída'));

      await controller.login(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('me', () => {
    it('debería retornar 401 si no hay usuario autenticado', async () => {
      await controller.me(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('debería retornar 200 con el usuario autenticado', async () => {
      req.user = { id: 'u-1', email: 'a@b.com' };

      await controller.me(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { user: { id: 'u-1', email: 'a@b.com' } },
      });
    });
  });

  describe('refresh', () => {
    it('debería retornar 401 si no hay refresh_token en cookies', async () => {
      req.cookies = {};

      await controller.refresh(req, res as Response);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('debería retornar 200 y refrescar cookies con un refresh_token válido', async () => {
      req.cookies = { refresh_token: 'valid-refresh' };
      vi.mocked(AuthService.prototype.refreshSession).mockResolvedValue({
        user: { id: 'u-1', email: 'a@b.com' },
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 3600,
      } as any);

      await controller.refresh(req, res as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'new-access-token',
        expect.objectContaining({ httpOnly: true, maxAge: 3600 * 1000 })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'new-refresh-token',
        expect.objectContaining({ httpOnly: true })
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'success',
        data: { user: { id: 'u-1', email: 'a@b.com' } },
      });
    });

    it('debería limpiar cookies y retornar 401 si el refresh token expiró o es inválido', async () => {
      req.cookies = { refresh_token: 'expired-refresh' };
      vi.mocked(AuthService.prototype.refreshSession).mockRejectedValue(
        new AuthApiError('Invalid Refresh Token', 400, 'invalid_grant')
      );

      await controller.refresh(req, res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', () => {
    it('debería limpiar la cookie y retornar 200', async () => {
      req.cookies = { access_token: 'token-abc' };
      vi.mocked(AuthService.prototype.signOut).mockResolvedValue(undefined as any);

      await controller.logout(req, res as Response);

      expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.any(Object));
      expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
