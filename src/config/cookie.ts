import { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'access_token';

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};
