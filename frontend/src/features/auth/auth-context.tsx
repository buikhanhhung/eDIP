import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { apiClient, TOKEN_STORAGE_KEY } from '@/lib/api-client';

export type Role = 'admin' | 'user' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  /** True until the stored token has been checked against the API. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // A token in localStorage is a claim, not a session: it may be expired or
  // signed by a previous JWT_SECRET. Ask the API who it thinks we are before
  // rendering anything role-dependent.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
      setLoading(false);
      return;
    }
    apiClient
      .get<{ user: AuthUser | null; permissions: string[] }>('/auth/me')
      .then(({ data }) => {
        if (data.user) {
          setUser(data.user);
          setPermissions(data.permissions);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
      })
      .catch(() => localStorage.removeItem(TOKEN_STORAGE_KEY))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiClient.post<{ accessToken: string; user: AuthUser }>(
      '/auth/login',
      { email, password },
    );
    localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);
    const me = await apiClient.get<{ permissions: string[] }>('/auth/me');
    setUser(data.user);
    setPermissions(me.data.permissions);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setPermissions([]);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      permissions,
      loading,
      login,
      logout,
      can: (permission: string) => permissions.includes(permission),
    }),
    [user, permissions, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
