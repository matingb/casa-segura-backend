import { CookieOptions } from 'express';

export const AUTH_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export const AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: '/',
};
