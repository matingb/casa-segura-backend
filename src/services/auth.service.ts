import { supabase } from '../config/supabase';
import { AuthError, User } from '@supabase/supabase-js';

export interface AuthSessionResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  async signIn(email: string, password: string): Promise<AuthSessionResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;
    if (!data.session) throw new AuthError('No session was created after sign in.');

    return {
      user: data.user,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in ?? 3600,
    };
  }

  async refreshSession(refreshToken: string): Promise<AuthSessionResult> {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (error) throw error;
    if (!data.session || !data.user) throw new AuthError('No session was created after refresh.');

    return {
      user: data.user,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in ?? 3600,
    };
  }

  async getUser(token: string): Promise<User> {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      throw error ?? new AuthError('Token is invalid or expired.');
    }

    return data.user;
  }

  async signOut(token: string): Promise<void> {
    await supabase.auth.admin.signOut(token);
  }
}
