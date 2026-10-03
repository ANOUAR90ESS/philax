import type { Locale, LoginRequest, RegisterRequest, UserView } from '@philax/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from '../api/auth';
import { ApiClientError } from '../api/client';
import { setLocale } from '../lib/i18n';

interface AuthState {
  user: UserView | null;
  loading: boolean;
  login(body: LoginRequest): Promise<void>;
  register(body: RegisterRequest): Promise<void>;
  logout(): Promise<void>;
  changeLocale(locale: Locale): Promise<void>;
  deleteAccount(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authApi
      .me()
      .then(({ user: u }) => {
        if (!cancelled) setUser(u);
      })
      .catch((err: unknown) => {
        if (!(err instanceof ApiClientError) || err.code !== 'UNAUTHENTICATED') {
          console.warn('[auth] session check failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (body: LoginRequest) => {
    const { user: u } = await authApi.login(body);
    setUser(u);
  }, []);

  const register = useCallback(async (body: RegisterRequest) => {
    const { user: u } = await authApi.register(body);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const changeLocale = useCallback(
    async (locale: Locale) => {
      await setLocale(locale);
      if (user) {
        const { user: u } = await authApi.updateLocale(locale);
        setUser(u);
      }
    },
    [user],
  );

  const deleteAccount = useCallback(async () => {
    await authApi.deleteAccount();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, changeLocale, deleteAccount }),
    [user, loading, login, register, logout, changeLocale, deleteAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
